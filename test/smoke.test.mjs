// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// test/smoke.test.mjs — a tiny, dependency-free smoke test for the cognition core.
// Uses only Node's built-in `assert` and `node:test` — no extra install needed,
// matching CogMesh's dependency-free philosophy.
//
//   node --test          # run all tests
//   npm test             # same, via package.json
//
// These are *smoke tests*: they verify the public API imports and behaves as the
// README claims. They are intentionally lightweight, not exhaustive unit tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  synthesize,
  reflect,
  PADState,
  nearestEmotion,
  blendEmotions,
} from '../core/pad/index.js';
import { WorldModel } from '../core/world/index.js';
import { allocateBudget } from '../core/orchestrator/boundedRationality.js';
import { EngineRegistry } from '../core/mesh/EngineRegistry.js';
import { MeshRouter } from '../core/mesh/MeshRouter.js';

// ── PAD: emotion emergence ────────────────────────────────────────────────
test('emergence: blended emotions produce the README-documented labels', () => {
  assert.equal(synthesize([{ id: 'elated' }, { id: 'sad' }]).label.en, 'Nostalgia');
  assert.equal(synthesize([{ id: 'curious' }, { id: 'panic' }]).label.en, 'Thrill');
  assert.equal(synthesize([{ id: 'proud' }, { id: 'vigilant' }]).label.en, 'Resolve');
});

// ── PAD: state tracking is bounded and gradual ────────────────────────────
test('PADState: coordinates stay clamped within [-1, 1] after updates', () => {
  const state = new PADState({ initial: { p: -0.8, a: 0.9, d: 0.4 } });
  state.update({ p: 1.0, a: 0.7, d: 0.8 });
  const { p, a, d } = state.coord;
  for (const v of [p, a, d]) {
    assert.ok(v >= -1 && v <= 1, `coordinate ${v} out of [-1, 1]`);
  }
});

test('PADState: rejects stability-violating lambda + alpha > 1', () => {
  assert.throws(() => new PADState({ lambda: 0.8, alpha: 0.8 }));
});

// ── PAD: metacognition reports reasoning params ───────────────────────────
test('metacognition: reflect returns reasoning params and a self-report', () => {
  const m = reflect([{ id: 'curious', weight: 0.8 }], { lang: 'en' });
  assert.ok(m.params, 'params missing');
  assert.equal(typeof m.selfReport, 'string');
  assert.ok(m.selfReport.length > 0);
});

test('metacognition: lang option switches the self-report language', () => {
  const en = reflect([{ id: 'proud', weight: 1 }], { lang: 'en' }).selfReport;
  const ko = reflect([{ id: 'proud', weight: 1 }], { lang: 'ko' }).selfReport;
  assert.ok(/[A-Za-z]/.test(en), 'EN report should contain Latin letters');
  assert.ok(/[가-힣]/.test(ko), 'KO report should contain Hangul');
});

// ── PAD: low-level helpers ────────────────────────────────────────────────
test('helpers: nearestEmotion and blendEmotions are callable', () => {
  const near = nearestEmotion({ p: 0.5, a: 0.5, d: 0.5 });
  assert.ok(near && near.emotion, 'nearestEmotion should resolve an emotion');
  const blend = blendEmotions([{ id: 'elated' }, { id: 'sad' }]);
  assert.ok(blend && blend.coord && typeof blend.coord.p === 'number', 'blend should yield PAD coords under .coord');
});

// ── World Model: entities + relations ─────────────────────────────────────
test('WorldModel: tracks objects and neighbor relations', () => {
  const w = new WorldModel();
  w.addObject({ id: 'samsung', attrs: { name: 'Samsung' } });
  w.addObject({ id: 'hbm', attrs: { name: 'HBM demand' } });
  w.addRelation({ from: 'hbm', to: 'samsung', type: 'causal', weight: 0.8 });
  assert.deepEqual(w.getNeighbors('samsung'), ['hbm']);
});

// ── Bounded Rationality: budget tiers ─────────────────────────────────────
test('boundedRationality: allocateBudget returns a tier and cost', () => {
  const b = allocateBudget({ confidence: 0.2, uncertainty: 0.6, inputLength: 100, exploration: 0.8 });
  assert.ok(typeof b.tier === 'string' && b.tier.length > 0);
  assert.ok(Number.isFinite(b.cost));
});

// ── Mesh: routing picks the most confident engine ─────────────────────────
test('MeshRouter: routes to the most confident engine', async () => {
  const reg = new EngineRegistry();
  reg.register('finance', {
    id: 'finance',
    canHandle: (t) => ({ canHandle: /stock|ticker/.test(t), confidence: 0.9 }),
    run: async () => 'finance result',
  });
  reg.register('coding', {
    id: 'coding',
    canHandle: (t) => ({ canHandle: /code|python/.test(t), confidence: 0.7 }),
    run: async () => 'coding result',
  });
  const mesh = new MeshRouter(reg);

  const routed = await mesh.route('write python code');
  assert.equal(routed.engineId, 'coding');
  assert.equal(routed.result, 'coding result');
});

test('MeshRouter: poll ranks candidates by confidence', () => {
  const reg = new EngineRegistry();
  reg.register('finance', {
    id: 'finance',
    canHandle: (t) => ({ canHandle: /stock/.test(t), confidence: 0.9 }),
    run: async () => 'x',
  });
  const mesh = new MeshRouter(reg);
  const candidates = mesh.poll('is this stock a buy?');
  assert.ok(Array.isArray(candidates) && candidates.length >= 1);
  assert.equal(candidates[0].id, 'finance');
});

// ── Logger: leveled, silenceable, redirectable ────────────────────────────
test('logger: respects level threshold and silent mode', async () => {
  const { logger } = await import('../core/util/index.js');
  const seen = [];
  logger.setSink((lvl, tag, _args) => seen.push(`${lvl}:${tag}`));

  logger.setLevel('warn');
  logger.info('T', 'below threshold'); // dropped
  logger.warn('T', 'at threshold');    // kept
  assert.deepEqual(seen, ['warn:T']);

  logger.setLevel('silent');
  logger.error('T', 'nothing escapes silent'); // dropped
  assert.equal(seen.length, 1);

  // restore defaults so other tests/consumers aren't affected
  logger.setSink(null).setLevel('warn');
});
