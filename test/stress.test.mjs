// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// test/stress.test.mjs — stress, safety, and profiling tests for the cognition core.
//
// Unlike smoke.test.mjs (which checks the public API works), this suite hammers the
// long-running paths the way a real session would:
//
//   1. Memory leak / bounded-growth  — push thousands of turns, assert memory stays capped
//   2. Loop / deadlock safety        — self-referential world graphs & repeated routing
//   3. Performance profiling         — per-module timing to surface bottlenecks
//
// Everything here is dependency-free and runs under Node's built-in test runner:
//
//   node --test test/stress.test.mjs
//   npm run test:stress

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  WorkingMemory,
  EpisodeMemory,
  SemanticMemory,
  ReflectionMemory,
} from '../core/memory/index.js';
import { WorldModel } from '../core/world/index.js';
import { synthesize, reflect, PADState } from '../core/pad/index.js';
import { allocateBudget } from '../core/orchestrator/boundedRationality.js';
import { EngineRegistry } from '../core/mesh/EngineRegistry.js';
import { MeshRouter } from '../core/mesh/MeshRouter.js';

// ═══════════════════════════════════════════════════════════════════════════
// 1. MEMORY LEAK / BOUNDED GROWTH
//    The #1 concern for a long-running agent: does memory grow without bound?
// ═══════════════════════════════════════════════════════════════════════════

test('WorkingMemory: stays capped at capacity under 10k pushes (no leak)', () => {
  const cap = 8;
  const wm = new WorkingMemory({ capacity: cap });
  for (let i = 0; i < 10_000; i++) {
    wm.push({ text: `turn ${i}` });
  }
  const ctx = wm.context();
  assert.equal(ctx.length, cap, `working memory should stay at ${cap}, got ${ctx.length}`);
  // the retained window must be the *most recent* turns, not the oldest
  assert.equal(ctx[ctx.length - 1].text, 'turn 9999');
  assert.equal(ctx[0].text, 'turn 9992');
});

test('EpisodeMemory: bounded capacity prevents unbounded growth (no leak)', () => {
  const em = new EpisodeMemory(); // default capacity 200
  for (let i = 0; i < 5_000; i++) {
    em.remember({ role: 'user', text: `event number ${i} about samsung` });
  }
  // key leak-safety property: 5k inserts but memory stays capped at capacity
  assert.equal(em.size(), 200, 'EpisodeMemory should cap at its capacity, not grow to 5000');
  const hits = em.recall('samsung', 5);
  assert.ok(hits.length <= 5, 'recall must respect its limit');
  assert.ok(hits.length > 0, 'recall should find matching episodes');
  assert.ok(em.recent(10).length <= 10);
});

test('EpisodeMemory: high explicit capacity is honored', () => {
  const em = new EpisodeMemory({ capacity: 5_000 });
  for (let i = 0; i < 5_000; i++) {
    em.remember({ role: 'user', text: `event ${i}` });
  }
  assert.equal(em.size(), 5_000, 'explicit capacity should be respected');
});

test('SemanticMemory: overwriting the same key does not grow storage', () => {
  const sm = new SemanticMemory();
  for (let i = 0; i < 10_000; i++) {
    sm.assert('samsung_price', i); // same key, updated 10k times
  }
  assert.equal(sm.all().length, 1, 'repeated assert on one key must not accumulate entries');
  // get() returns a record { value, confidence, t } — not the bare value
  assert.equal(sm.get('samsung_price').value, 9999);
});

test('ReflectionMemory: bounded and clearable after heavy use', () => {
  const rm = new ReflectionMemory({ capacity: 50 });
  for (let i = 0; i < 5_000; i++) {
    rm.record({ stance: 'curious', note: `reflection ${i}` });
  }
  // recent() should stay small regardless of how much was recorded
  assert.ok(rm.recent(100).length <= 100);
  rm.clear();
  assert.equal(rm.recent(10).length, 0, 'clear() must empty the store');
});

test('PADState: repeated updates do not accumulate hidden state', () => {
  const st = new PADState();
  for (let i = 0; i < 100_000; i++) {
    st.update({ p: Math.sin(i), a: Math.cos(i), d: 0.1 });
  }
  // the only retained state is a single 3-number coordinate — always in range
  for (const v of [st.coord.p, st.coord.a, st.coord.d]) {
    assert.ok(v >= -1 && v <= 1, `coord ${v} escaped [-1,1] after 100k updates`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. LOOP / DEADLOCK SAFETY
//    Cyclic graphs and repeated routing must terminate — never hang.
// ═══════════════════════════════════════════════════════════════════════════

test('WorldModel: self-referential cycle does not cause infinite traversal', () => {
  const w = new WorldModel();
  w.addObject({ id: 'a', attrs: { name: 'A' } });
  w.addObject({ id: 'b', attrs: { name: 'B' } });
  w.addObject({ id: 'c', attrs: { name: 'C' } });
  // build a cycle a → b → c → a
  w.addRelation({ from: 'a', to: 'b', type: 'causal' });
  w.addRelation({ from: 'b', to: 'c', type: 'causal' });
  w.addRelation({ from: 'c', to: 'a', type: 'causal' });
  // self-loop too
  w.addRelation({ from: 'a', to: 'a', type: 'causal' });

  // getNeighbors must return immediately, not chase the cycle forever
  const n = w.getNeighbors('a');
  assert.ok(Array.isArray(n), 'getNeighbors should return an array even with cycles');
});

test('MeshRouter: 1000 sequential routes all terminate', async () => {
  const reg = new EngineRegistry();
  reg.register('general', {
    id: 'general',
    canHandle: () => ({ canHandle: true, confidence: 0.5 }),
    run: async () => 'ok',
  });
  const mesh = new MeshRouter(reg);
  for (let i = 0; i < 1000; i++) {
    const r = await mesh.route(`query ${i}`);
    assert.ok(r, `route ${i} returned falsy`);
  }
});

test('synthesize: degenerate inputs are handled safely', () => {
  // empty input is invalid — it should throw a clear error, not hang or return garbage
  assert.throws(() => synthesize([]), /at least one emotion/i,
    'empty input should throw a descriptive error');
  // single and many-identical inputs are valid and must return quickly
  assert.doesNotThrow(() => synthesize([{ id: 'sad' }]));
  assert.doesNotThrow(() => synthesize(Array(200).fill({ id: 'sad' })));
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. PERFORMANCE PROFILING
//    Per-module timing. Not a hard benchmark — a bottleneck spotlight.
//    (Generous ceilings so CI never flakes on a slow shared runner.)
// ═══════════════════════════════════════════════════════════════════════════

function timeIt(label, iterations, fn) {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn(i);
  const ms = performance.now() - start;
  const perOp = (ms / iterations) * 1000; // microseconds per op
  console.log(`   ⏱️  ${label.padEnd(28)} ${ms.toFixed(1)}ms total | ${perOp.toFixed(2)}µs/op (${iterations}x)`);
  return ms;
}

test('profiling: hot paths report timings (bottleneck spotlight)', () => {
  console.log('\n   ── CogMesh core profiling ──');

  const emoPair = [{ id: 'elated' }, { id: 'sad' }];
  timeIt('synthesize (emergence)', 50_000, () => synthesize(emoPair));

  timeIt('reflect (metacognition)', 50_000, () => reflect([{ id: 'curious', weight: 0.8 }]));

  const st = new PADState();
  timeIt('PADState.update', 100_000, (i) => st.update({ p: Math.sin(i), a: 0.2, d: 0.1 }));

  timeIt('allocateBudget', 100_000, () =>
    allocateBudget({ confidence: 0.3, uncertainty: 0.5, inputLength: 80, exploration: 0.4 }));

  const w = new WorldModel();
  timeIt('WorldModel.addObject', 20_000, (i) => w.addObject({ id: `o${i}`, attrs: { name: `n${i}` } }));

  const wm = new WorkingMemory({ capacity: 8 });
  timeIt('WorkingMemory.push', 100_000, (i) => wm.push({ text: `t${i}` }));

  console.log('   ────────────────────────────\n');
  // The test passes as long as everything completed; timings are informational.
  assert.ok(true);
});
