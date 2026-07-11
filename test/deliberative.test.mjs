// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// test/deliberative.test.mjs — tests for the plan → simulate → choose loop.
//
//   node --test test/deliberative.test.mjs
//   npm run test:deliberative

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { WorldModel, WorldSimulator } from '../core/world/index.js';
import { Planner } from '../core/orchestrator/planner.js';
import { DeliberativeLoop } from '../core/orchestrator/deliberativeLoop.js';

function setup(goalWeights) {
  const world = new WorldModel();
  world.setField('wealth', 100);
  world.setField('risk', 0.3);
  const simulator = new WorldSimulator(world, { goalWeights });
  return { world, simulator };
}

// ── deliberate over explicit candidates ───────────────────────────────────
test('loop: picks the highest-scoring simulated future', () => {
  const { simulator } = setup({ wealth: 1, risk: -30 });
  const loop = new DeliberativeLoop({ simulator });

  const out = loop.deliberate([
    { id: 'aggressive', action: { field: { wealth: 160, risk: 0.9 } } }, // 160-27=133
    { id: 'balanced', action: { field: { wealth: 125, risk: 0.4 } } },   // 125-12=113
    { id: 'conservative', action: { field: { wealth: 108, risk: 0.1 } } }, // 108-3=105
  ]);

  assert.equal(out.considered, 3);
  assert.equal(out.chosen.candidate.id, 'aggressive');
  // ranked in non-increasing order
  for (let i = 1; i < out.ranked.length; i++) {
    assert.ok(out.ranked[i - 1].score >= out.ranked[i].score);
  }
});

test('loop: never mutates the live world during deliberation', () => {
  const { world, simulator } = setup({ wealth: 1 });
  const loop = new DeliberativeLoop({ simulator });
  loop.deliberate([
    { id: 'a', action: { field: { wealth: 999 } } },
    { id: 'b', action: { field: { wealth: 500 } } },
  ]);
  assert.equal(world.getField('wealth'), 100, 'imagination must not touch reality');
});

// ── extra evaluator is folded into the score ──────────────────────────────
test('loop: a custom evaluate() is added to the simulator score', () => {
  const { simulator } = setup({ wealth: 1 });
  // bonus that rewards a candidate tagged "safe"
  const evaluate = (candidate) => (candidate.id === 'safe' ? 1000 : 0);
  const loop = new DeliberativeLoop({ simulator, evaluate });

  const out = loop.deliberate([
    { id: 'rich', action: { field: { wealth: 200 } } },  // 200 + 0
    { id: 'safe', action: { field: { wealth: 110 } } },  // 110 + 1000 = 1110
  ]);
  assert.equal(out.chosen.candidate.id, 'safe', 'evaluator bonus should tip the choice');
});

// ── full goal pipeline via the Planner ────────────────────────────────────
test('loop: deliberateGoal decomposes, expands, simulates, and chooses', () => {
  const { simulator } = setup({ wealth: 1, risk: -30 });
  const planner = new Planner();
  const loop = new DeliberativeLoop({ simulator, planner });

  const expand = () => [
    { id: 'aggressive', action: { field: { wealth: 160, risk: 0.9 } } },
    { id: 'balanced', action: { field: { wealth: 125, risk: 0.4 } } },
  ];
  const out = loop.deliberateGoal('invest my savings wisely', expand);

  assert.equal(out.strategy, 'finance', 'planner should recognize a finance goal');
  assert.equal(out.chosen.candidate.id, 'aggressive');
  assert.ok(out.goal.length > 0);
});

// ── robustness ────────────────────────────────────────────────────────────
test('loop: empty candidates yield a null choice, no throw', () => {
  const { simulator } = setup({ wealth: 1 });
  const loop = new DeliberativeLoop({ simulator });
  const out = loop.deliberate([]);
  assert.equal(out.chosen, null);
  assert.equal(out.considered, 0);
});

test('loop: requires a simulator; deliberateGoal requires a planner + expand', () => {
  assert.throws(() => new DeliberativeLoop({}), /WorldSimulator is required/);

  const { simulator } = setup({ wealth: 1 });
  const noPlanner = new DeliberativeLoop({ simulator });
  assert.throws(() => noPlanner.deliberateGoal('x', () => []), /no Planner/);

  const withPlanner = new DeliberativeLoop({ simulator, planner: new Planner() });
  assert.throws(() => withPlanner.deliberateGoal('x', null), /expand/);
});
