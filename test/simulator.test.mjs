// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// test/simulator.test.mjs — tests for World Model branching & future simulation.
//
//   node --test test/simulator.test.mjs
//   npm run test:simulator

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { WorldModel } from '../core/world/index.js';
import { WorldSimulator } from '../core/world/WorldSimulator.js';

// ── branching keeps the live world safe ───────────────────────────────────
test('world: branch() is an independent copy — mutating it never touches the original', () => {
  const world = new WorldModel();
  world.addObject({ id: 'samsung', state: { price: 70000 } });

  const future = world.branch();
  future.addObject({ id: 'samsung', state: { price: 85000 } });

  assert.equal(world.getObject('samsung').state.price, 70000, 'original must be untouched');
  assert.equal(future.getObject('samsung').state.price, 85000, 'branch should reflect the change');
});

test('world: restore() rebuilds state from a snapshot faithfully', () => {
  const world = new WorldModel();
  world.addObject({ id: 'a', state: { x: 1 } });
  world.addObject({ id: 'b', state: { x: 2 } });
  world.addRelation({ from: 'a', to: 'b', type: 'causal', weight: 0.7 });
  world.setField('mood', 0.5);

  const snap = world.snapshot();
  const restored = new WorldModel().restore(snap);

  assert.equal(restored.getObject('a').state.x, 1);
  assert.deepEqual(restored.getNeighbors('a'), ['b']);
  assert.equal(restored.getField('mood'), 0.5);
});

// ── single rollout ────────────────────────────────────────────────────────
test('simulator: rollout applies an action to a branch and scores the future', () => {
  const world = new WorldModel();
  world.setField('value', 100);
  const sim = new WorldSimulator(world, { goalWeights: { value: 1 } });

  const r = sim.rollout({ id: 'grow', field: { value: 150 } });
  assert.equal(r.score, 150, 'score should reflect the future field value');
  assert.equal(world.getField('value'), 100, 'live world must remain at 100');
});

// ── imagine + rank multiple futures ───────────────────────────────────────
test('simulator: imagine ranks candidate actions best-first', () => {
  const world = new WorldModel();
  world.setField('value', 100);
  world.setField('risk', 0.3);
  const sim = new WorldSimulator(world, { goalWeights: { value: 1, risk: -50 } });

  const actions = [
    { id: 'aggressive', field: { value: 150, risk: 0.8 } },
    { id: 'steady', field: { value: 115, risk: 0.2 } },
    { id: 'cash', field: { value: 100, risk: 0.05 } },
  ];
  const out = sim.imagine(actions);

  assert.equal(out.considered, 3);
  // scores: aggressive 150-40=110, steady 115-10=105, cash 100-2.5=97.5
  assert.equal(out.best.action.id, 'aggressive');
  assert.equal(out.ranked[out.ranked.length - 1].action.id, 'cash');
  // ranked in non-increasing score order
  for (let i = 1; i < out.ranked.length; i++) {
    assert.ok(out.ranked[i - 1].score >= out.ranked[i].score);
  }
});

test('simulator: chooseBest returns the single best future', () => {
  const world = new WorldModel();
  world.setField('reward', 0);
  const sim = new WorldSimulator(world, { goalWeights: { reward: 1 } });

  const best = sim.chooseBest([
    { id: 'low', field: { reward: 1 } },
    { id: 'high', field: { reward: 9 } },
    { id: 'mid', field: { reward: 5 } },
  ]);
  assert.equal(best.action.id, 'high');
  assert.equal(best.score, 9);
});

// ── object-level effects + custom scorer ──────────────────────────────────
test('simulator: object effects and a custom scorer work end-to-end', () => {
  const world = new WorldModel();
  world.addObject({ id: 'hero', state: { hp: 100, gold: 0 } });

  const sim = new WorldSimulator(world, {
    scoreFn: (w) => {
      const h = w.getObject('hero').state;
      return h.gold - (100 - h.hp); // reward gold, penalize hp loss
    },
  });

  const out = sim.imagine([
    { id: 'fight', effects: { hero: { hp: 60, gold: 50 } } }, // 50 - 40 = 10
    { id: 'trade', effects: { hero: { hp: 100, gold: 20 } } }, // 20 - 0 = 20
  ]);
  assert.equal(out.best.action.id, 'trade');
  // original hero is untouched
  assert.equal(world.getObject('hero').state.hp, 100);
});

// ── robustness ────────────────────────────────────────────────────────────
test('simulator: empty action list yields a null best, no throw', () => {
  const sim = new WorldSimulator(new WorldModel());
  const out = sim.imagine([]);
  assert.equal(out.best, null);
  assert.equal(out.considered, 0);
});

test('simulator: multi-step rollout applies the action repeatedly', () => {
  const world = new WorldModel();
  world.setField('count', 0);
  // custom apply: increment count each step
  const sim = new WorldSimulator(world, {
    applyFn: (w) => w.setField('count', (w.getField('count') || 0) + 1),
    goalWeights: { count: 1 },
  });
  const r = sim.rollout({ id: 'tick' }, { steps: 5 });
  assert.equal(r.score, 5, '5 steps → count should reach 5');
  assert.equal(world.getField('count'), 0, 'live world untouched');
});
