// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// test/stability.test.mjs — robust self-improvement.
//
//   node --test test/stability.test.mjs
//
// Two layers: the StabilityGuard in isolation (poison isolation, patience-based plateau,
// regression flagging), and its integration into the CognitiveMesh (a NaN-producing scoreFn
// must never contaminate the ranked pool or the best score).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { WorldModel, WorldSimulator } from '../core/world/index.js';
import { StabilityGuard, CognitiveMesh, ResourceManager } from '../core/cognition/index.js';

// ── StabilityGuard unit ─────────────────────────────────────────────────────
test('guard: sanitize removes NaN/Infinity-scored candidates', () => {
  const g = new StabilityGuard();
  const { clean, removed } = g.sanitize([
    { id: 'ok', score: 10 },
    { id: 'nan', score: NaN },
    { id: 'inf', councilScore: Infinity },
    { id: 'good', councilScore: 5 },
  ]);
  assert.deepEqual(clean.map((c) => c.id), ['ok', 'good']);
  assert.equal(removed.length, 2);
  assert.equal(g.dropped, 2);
});

test('guard: sanitize removes candidates whose action carries non-finite fields', () => {
  const g = new StabilityGuard();
  const { clean } = g.sanitize([
    { id: 'ok', score: 1, action: { field: { x: 5 } } },
    { id: 'bad', score: 1, action: { field: { x: NaN } } },
  ]);
  assert.deepEqual(clean.map((c) => c.id), ['ok']);
});

test('guard: patience — stops only after N non-improving cycles', () => {
  const g = new StabilityGuard({ patience: 2, minDelta: 1e-6 });
  g.record(10); assert.equal(g.verdict().stop, false); // improved
  g.record(10); assert.equal(g.verdict().stop, false); // stale 1
  g.record(10); assert.equal(g.verdict().stop, true);  // stale 2 → plateau
  assert.match(g.verdict().reason, /plateau/);
  assert.equal(g.verdict().trend, 'plateau');
});

test('guard: a single flat cycle amid progress does not stop', () => {
  const g = new StabilityGuard({ patience: 2 });
  g.record(10);   // improve
  g.record(10);   // stale 1
  g.record(20);   // improve again → resets stale
  assert.equal(g.verdict().stop, false, 'progress resumed, keep going');
});

test('guard: non-finite scores never advance the best', () => {
  const g = new StabilityGuard();
  g.record(50);
  g.record(NaN);        // ignored
  g.record(Infinity);   // ignored (not > best + delta in a meaningful way)
  assert.equal(g.status().best, 50);
});

test('guard: reset clears all state', () => {
  const g = new StabilityGuard();
  g.record(10); g.sanitize([{ score: NaN }]);
  g.reset();
  assert.equal(g.status().best, null);
  assert.equal(g.dropped, 0);
  assert.equal(g.status().cyclesRecorded, 0);
});

// ── CognitiveMesh integration ───────────────────────────────────────────────
function nanSim() {
  const world = new WorldModel();
  world.setField('wealth', 100);
  let n = 0;
  // every 5th rollout returns NaN — the confirmed poisoning scenario
  return new WorldSimulator(world, { scoreFn: (w) => { n++; return n % 5 === 0 ? NaN : w.getField('wealth') + n; } });
}

test('integration: NaN scores never reach the ranked pool', () => {
  const mesh = new CognitiveMesh({
    simulator: nanSim(),
    resources: new ResourceManager({ maxRollouts: 100000, maxCycles: 4 }),
    config: { cache: false, metaReason: false, attention: false },
  });
  const r = mesh.run('grow');
  let nanInRanked = 0;
  for (const cycle of r.cycles) {
    for (const c of (cycle.ranked || [])) {
      if (Number.isNaN(c.councilScore) || Number.isNaN(c.score)) nanInRanked++;
    }
  }
  assert.equal(nanInRanked, 0, 'no NaN candidate survived into ranking');
  assert.ok(!Number.isNaN(r.bestScore), 'best score stayed finite');
  assert.ok(r.stability.poisonedDropped > 0, 'guard actually caught poison');
});

test('integration: run result exposes the improvement trajectory', () => {
  const world = new WorldModel();
  world.setField('wealth', 100); world.setField('risk', 0.3);
  const sim = new WorldSimulator(world, { goalWeights: { wealth: 1, risk: -20 } });
  const mesh = new CognitiveMesh({
    simulator: sim,
    resources: new ResourceManager({ maxRollouts: 100000, maxCycles: 5 }),
    config: { cache: false },
  });
  const r = mesh.run('grow safely');
  assert.ok(Array.isArray(r.stability.trajectory), 'trajectory exposed');
  assert.ok(['improving', 'plateau', 'unstable'].includes(r.stability.trend));
});

test('integration: config.stability=false disables the guard', () => {
  const world = new WorldModel();
  world.setField('x', 1);
  const sim = new WorldSimulator(world, { goalWeights: { x: 1 } });
  const mesh = new CognitiveMesh({ simulator: sim, config: { stability: false } });
  const r = mesh.run('x');
  assert.equal(mesh.stability, null);
  assert.equal(r.stability, null);
});

test('integration: plateau stops before the cycle cap is exhausted', () => {
  const world = new WorldModel();
  world.setField('x', 50);
  const sim = new WorldSimulator(world, { goalWeights: { x: 1 } });
  const mesh = new CognitiveMesh({
    simulator: sim,
    resources: new ResourceManager({ maxRollouts: 100000, maxCycles: 20 }),
    config: { cache: false, patience: 2 },
  });
  const r = mesh.run('maximize x');
  assert.ok(r.cycles.length < 20, 'stopped on plateau, not by exhausting the cycle cap');
});
