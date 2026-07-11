// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// test/metaReasoner.test.mjs — the Meta-Reasoner (decide HOW to think).
//
//   node --test test/metaReasoner.test.mjs
//
// The contract: the right strategy for the situation, safe vetoes (never snap-judge risky
// or verification tasks), a concrete config per strategy, and a real behavior change when
// wired into the CognitiveMesh.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { WorldModel, WorldSimulator } from '../core/world/index.js';
import { MetaReasoner, STRATEGIES, CognitiveMesh, ResourceManager } from '../core/cognition/index.js';

const mr = new MetaReasoner();

test('meta: easy low-stakes situation → INTUITIVE (System 1)', () => {
  assert.equal(mr.select({ complexity: 0.1, stakes: 0.1 }).strategy, 'INTUITIVE');
});

test('meta: complex high-stakes → DELIBERATE (System 2)', () => {
  assert.equal(mr.select({ complexity: 0.8, stakes: 0.9 }).strategy, 'DELIBERATE');
});

test('meta: high novelty (stuck) → DIVERGENT', () => {
  assert.equal(mr.select({ novelty: 0.9 }).strategy, 'DIVERGENT');
});

test('meta: explicit verify → SKEPTICAL', () => {
  assert.equal(mr.select({ verify: true, stakes: 0.6 }).strategy, 'SKEPTICAL');
});

test('meta: no signal defaults to a fast, cheap strategy', () => {
  assert.equal(mr.select({}).strategy, 'INTUITIVE');
});

test('meta: high stakes vetoes the intuitive fast-path', () => {
  const { scores } = mr.select({ stakes: 0.9 });
  assert.equal(scores.INTUITIVE, 0, 'never snap-judge a high-stakes situation');
});

test('meta: verify vetoes intuitive and divergent', () => {
  const { scores } = mr.select({ verify: true });
  assert.equal(scores.INTUITIVE, 0);
  assert.ok(scores.SKEPTICAL > scores.DIVERGENT, 'verification prefers skepticism over divergence');
});

test('meta: threatening mood steers away from snap judgment', () => {
  const r = mr.select({ pad: { p: -0.8, a: 0.9, d: -0.3 } });
  assert.notEqual(r.strategy, 'INTUITIVE', 'a threat-tinged mood should not snap-judge');
});

test('meta: every strategy carries a usable config', () => {
  for (const key of Object.keys(STRATEGIES)) {
    const c = STRATEGIES[key].config;
    assert.ok(Number.isFinite(c.beamWidth) && c.beamWidth > 0);
    assert.ok(Number.isFinite(c.debateRounds) && c.debateRounds >= 0);
    assert.ok(Number.isFinite(c.attentionTopK) && c.attentionTopK > 0);
  }
});

test('meta: rationale explains the choice', () => {
  const r = mr.select({ verify: true });
  assert.match(r.rationale, /SKEPTICAL/);
  assert.match(r.rationale, /verification/);
});

// ── integration: strategy reshapes the mesh ─────────────────────────────────
function runWith(ctx) {
  const world = new WorldModel();
  world.setField('wealth', 100); world.setField('risk', 0.3);
  const base = new WorldSimulator(world, { goalWeights: { wealth: 1, risk: -20 } });
  const mesh = new CognitiveMesh({
    simulator: base,
    resources: new ResourceManager({ maxRollouts: 100000, maxCycles: 4 }),
  });
  const r = mesh.run('allocate the portfolio', ctx);
  return { strategy: r.strategy.name, beam: mesh.beamWidth, debate: mesh.council.debateRounds, best: r.bestScore };
}

test('meta integration: intuitive vs deliberate reshape the mesh knobs', () => {
  const easy = runWith({ complexity: 0.1, stakes: 0.1 });
  const hard = runWith({ complexity: 0.85, stakes: 0.9 });
  assert.equal(easy.strategy, 'INTUITIVE');
  assert.equal(hard.strategy, 'DELIBERATE');
  assert.ok(hard.beam > easy.beam, 'deliberate searches wider');
  assert.ok(hard.debate > easy.debate, 'deliberate debates more');
  assert.ok(easy.best > 0 && hard.best > 0, 'both still produce results');
});

test('meta integration: config.metaReason=false disables it', () => {
  const world = new WorldModel();
  world.setField('wealth', 100);
  const base = new WorldSimulator(world, { goalWeights: { wealth: 1 } });
  const mesh = new CognitiveMesh({ simulator: base, config: { metaReason: false } });
  const r = mesh.run('x');
  assert.equal(mesh.metaReasoner, null);
  assert.equal(r.strategy, null);
});
