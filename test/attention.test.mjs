// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// test/attention.test.mjs — the Attention Manager (decide what to think about).
//
//   node --test test/attention.test.mjs
//
// The contract: attention shifts with the situation (goal keywords + PAD mood), safety is
// always attended, selection is bounded to topK, and wiring it into the CognitiveMesh cuts
// compute without changing the winner.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { WorldModel, WorldSimulator } from '../core/world/index.js';
import { AttentionManager, CognitiveMesh, ResourceManager } from '../core/cognition/index.js';

test('attention: financial goal pulls focus to risk/cost', () => {
  const am = new AttentionManager({ topK: 4 });
  const { attended } = am.attend({ goal: 'minimize risk and avoid loss while investing' });
  assert.ok(attended.includes('risk'), 'risk attended');
  assert.ok(attended.includes('cost'), 'cost attended');
});

test('attention: creative goal surfaces creativity', () => {
  const am = new AttentionManager({ topK: 4 });
  const { attended } = am.attend({ goal: 'invent a novel creative idea' });
  assert.ok(attended.includes('creativity'), 'creativity attended for a creative goal');
});

test('attention: safety is always attended (alwaysOn floor)', () => {
  const am = new AttentionManager({ topK: 3 });
  for (const goal of ['grow wealth fast', 'write a poem', '']) {
    assert.ok(am.attend({ goal }).attended.includes('safety'), `safety pinned for "${goal}"`);
  }
});

test('attention: fearful mood narrows to safety/risk', () => {
  const am = new AttentionManager({ topK: 4, moodWeight: 0.6 });
  const { scores } = am.attend({ goal: 'handle this', pad: { p: -0.8, a: 0.9, d: -0.3 } });
  assert.ok(scores.safety >= scores.creativity, 'threat mood favors safety over creativity');
  assert.ok(scores.risk >= scores.creativity, 'threat mood favors risk over creativity');
});

test('attention: selection is bounded to topK (plus always-on)', () => {
  const am = new AttentionManager({ topK: 3, alwaysOn: ['safety'] });
  const { attended } = am.attend({ goal: 'do everything at once' });
  assert.ok(attended.length <= 3, `attended ${attended.length} ≤ topK`);
  assert.ok(attended.includes('safety'));
});

test('attention: prioritize tags nodes with lens salience', () => {
  const am = new AttentionManager();
  const nodes = [{ id: 'a', lens: 'risk', meta: {} }, { id: 'b', lens: 'creativity', meta: {} }];
  const tagged = am.prioritize(nodes, { goal: 'avoid risk and loss' });
  const risk = tagged.find((n) => n.lens === 'risk');
  const creat = tagged.find((n) => n.lens === 'creativity');
  assert.ok(risk.meta.priority > creat.meta.priority, 'risk node prioritized for a risk goal');
});

test('attention: empty situation still returns a sensible non-empty set', () => {
  const am = new AttentionManager({ topK: 5 });
  const { attended } = am.attend({});
  assert.ok(attended.length > 0 && attended.length <= 5);
  assert.ok(attended.includes('safety'));
});

test('attention integration: CognitiveMesh focuses and keeps the same winner', () => {
  function run(attention) {
    const world = new WorldModel();
    world.setField('wealth', 100); world.setField('risk', 0.3);
    const base = new WorldSimulator(world, { goalWeights: { wealth: 1, risk: -20 } });
    let sims = 0; const orig = base.rollout.bind(base);
    base.rollout = (a, o) => { sims++; return orig(a, o); };
    const mesh = new CognitiveMesh({
      simulator: base,
      resources: new ResourceManager({ maxRollouts: 100000, maxCycles: 5 }),
      config: { beamWidth: 12, attention, cache: false, metaReason: false },
    });
    const r = mesh.run('minimize risk while growing wealth');
    return { sims, best: r.bestScore };
  }
  const off = run(false);
  const on = run(true);
  assert.ok(on.sims < off.sims, `attention cut sims: ${off.sims} → ${on.sims}`);
  assert.ok(Math.abs(on.best - off.best) < 1e-9, 'winner unchanged despite fewer perspectives');
});

test('attention: config.attention=false disables it', () => {
  const world = new WorldModel();
  world.setField('wealth', 100);
  const base = new WorldSimulator(world, { goalWeights: { wealth: 1 } });
  const mesh = new CognitiveMesh({ simulator: base, config: { attention: false } });
  assert.equal(mesh.attention, null);
});
