// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// test/cognition.test.mjs — the Brain-like Parallel Cognitive Mesh.
//
//   node --test test/cognition.test.mjs
//
// Covers each stage independently (decompose, simulate, evaluate+debate, conflict/
// synthesis, adaptive mesh, resource manager) and the full CognitiveMesh loop.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { WorldModel, WorldSimulator } from '../core/world/index.js';
import {
  DecompositionEngine, DEFAULT_PERSPECTIVES,
  ParallelWorldSimulation,
  EvaluationCouncil,
  worldEvaluator, logicEvaluator,
  ConflictEngine, SynthesisEngine, RegenerationEngine,
  AdaptiveMesh,
  ResourceManager,
  CognitiveMesh,
} from '../core/cognition/index.js';

function makeSim(goalWeights = { wealth: 1, risk: -20 }) {
  const world = new WorldModel();
  world.setField('wealth', 100);
  world.setField('risk', 0.3);
  return { world, simulator: new WorldSimulator(world, { goalWeights }) };
}

// ── Decomposition Engine ───────────────────────────────────────────────────
test('decomposition: one candidate splits into the perspective lenses', () => {
  const de = new DecompositionEngine();
  const nodes = de.decompose({ id: 'A', action: { field: { wealth: 150 } } });
  assert.equal(nodes.length, DEFAULT_PERSPECTIVES.length);
  assert.deepEqual(nodes.map((n) => n.lens).sort(), DEFAULT_PERSPECTIVES.slice().sort());
  // every node carries the source action and a parent link
  for (const n of nodes) {
    assert.equal(n.parentId, 'A');
    assert.equal(n.action.field.wealth, 150);
  }
});

test('decomposition: subplan mode splits a plan into per-step nodes', () => {
  const de = new DecompositionEngine();
  const nodes = de.decompose(
    { id: 'P', steps: [{ label: 'buy', action: { field: { wealth: 120 } } }, { label: 'sell' }] },
    { mode: 'subplan' }
  );
  assert.equal(nodes.length, 2);
  assert.equal(nodes[0].label, 'buy');
});

test('decomposition: lensBias tilts an individual lens action', () => {
  const de = new DecompositionEngine({
    perspectives: ['logic', 'risk'],
    lensBias: (lens) => (lens === 'risk' ? { field: { risk: 0.1 } } : null),
  });
  const nodes = de.decompose({ id: 'A', action: { field: { wealth: 200 } } });
  const risk = nodes.find((n) => n.lens === 'risk');
  assert.equal(risk.action.field.risk, 0.1);
  assert.equal(risk.action.field.wealth, 200); // base preserved
});

// ── Parallel World Simulation ──────────────────────────────────────────────
test('parallel simulation: every node gets an independent scored future', () => {
  const { world, simulator } = makeSim();
  const pws = new ParallelWorldSimulation(simulator);
  const nodes = [
    { id: 'n1', action: { field: { wealth: 200 } } },
    { id: 'n2', action: { field: { wealth: 120 } } },
  ];
  const out = pws.simulate(nodes);
  assert.equal(out.considered, 2);
  assert.ok(out.simulated[0].score >= out.simulated[1].score, 'ranked best-first');
  assert.ok(out.simulated[0].future, 'carries an imagined future');
  assert.equal(world.getField('wealth'), 100, 'live world never mutated');
});

test('parallel simulation: beam width prunes the tail', () => {
  const { simulator } = makeSim();
  const pws = new ParallelWorldSimulation(simulator, { beamWidth: 1 });
  const out = pws.simulate([
    { id: 'a', action: { field: { wealth: 300 } } },
    { id: 'b', action: { field: { wealth: 150 } } },
    { id: 'c', action: { field: { wealth: 110 } } },
  ]);
  assert.equal(out.simulated.length, 1);
  assert.equal(out.pruned.length, 2);
});

test('parallel simulation: a budget terminates low-priority nodes early', () => {
  const { simulator } = makeSim();
  const pws = new ParallelWorldSimulation(simulator);
  const budget = { affordableCount: () => 1 }; // only afford one
  const out = pws.simulate(
    [
      { id: 'hi', action: { field: { wealth: 200 } }, meta: { priority: 1 } },
      { id: 'lo', action: { field: { wealth: 200 } }, meta: { priority: 0 } },
    ],
    { budget }
  );
  assert.equal(out.simulated.length, 1);
  assert.equal(out.simulated[0].id, 'hi', 'higher priority admitted');
  assert.equal(out.pruned[0].meta.terminatedEarly, true);
});

test('parallel simulation async matches sync ranking', async () => {
  const { simulator } = makeSim();
  const pws = new ParallelWorldSimulation(simulator);
  const nodes = [
    { id: 'a', action: { field: { wealth: 130 } } },
    { id: 'b', action: { field: { wealth: 250 } } },
  ];
  const s = pws.simulate(nodes);
  const a = await pws.simulateAsync(nodes, { concurrency: 2 });
  assert.deepEqual(s.simulated.map((n) => n.id), a.simulated.map((n) => n.id));
});

// ── Evaluation Council + debate ────────────────────────────────────────────
test('council: aggregates verdicts, not a flat average', () => {
  const council = new EvaluationCouncil([
    { id: 'hi', weight: 1, evaluate: () => ({ score: 100, confidence: 0.9 }) },
    { id: 'lo', weight: 1, evaluate: () => ({ score: 0, confidence: 0.1 }) },
  ], { debateRounds: 0 });
  const { councilScore } = council.evaluate({ id: 'c', score: 50 });
  // confidence-weighted: the 0.9-confident 100 dominates the 0.1-confident 0 → well above 50
  assert.ok(councilScore > 50, `expected >50, got ${councilScore}`);
});

test('council: debate lets peers reweight a disputed verdict', () => {
  // an outlier evaluator disagreeing with the consensus should be discounted after debate
  const consensusA = { id: 'a', weight: 1, evaluate: () => ({ score: 100, confidence: 0.8 }) };
  const consensusB = { id: 'b', weight: 1, evaluate: () => ({ score: 100, confidence: 0.8 }) };
  const outlier = {
    id: 'x', weight: 1,
    evaluate: () => ({ score: -100, confidence: 0.8 }),
    review: () => ({ endorsement: 0.5 }),
  };
  const withDebate = new EvaluationCouncil([consensusA, consensusB, outlier], { debateRounds: 1, peerWeight: 0.8 });
  const r = withDebate.evaluate({ id: 'c', score: 0 });
  assert.ok(r.councilScore > 0, 'consensus pulls the score positive despite the outlier');
  assert.ok(r.agreement < 1, 'disagreement is reported');
});

test('council: deliberate ranks candidates best-first', () => {
  const council = new EvaluationCouncil([worldEvaluator, logicEvaluator], { debateRounds: 1 });
  const { ranked, best } = council.deliberate([
    { id: 'weak', score: 10, action: {}, future: {} },
    { id: 'strong', score: 90, action: { field: { x: 1 } }, future: {} },
  ]);
  assert.equal(best.candidate.id, 'strong');
  assert.ok(ranked[0].councilScore >= ranked[1].councilScore);
});

// ── Conflict / Synthesis / Regeneration ────────────────────────────────────
test('conflict: classifies shared vs opposed fields', () => {
  const ce = new ConflictEngine();
  const c = ce.analyze(
    { id: 'A', action: { field: { speed: 1, cost: 5 } } },
    { id: 'B', action: { field: { speed: 1, cost: 9 } } }
  );
  assert.ok('field.speed' in c.shared, 'equal field is shared');
  assert.ok('field.cost' in c.opposed, 'differing field is opposed');
  assert.ok(c.tension > 0 && c.tension <= 1);
});

test('synthesis: produces a new action leaning toward the stronger parent', () => {
  const ce = new ConflictEngine();
  const se = new SynthesisEngine();
  const a = { id: 'A', councilScore: 90, action: { field: { cost: 10 } } };
  const b = { id: 'B', councilScore: 10, action: { field: { cost: 0 } } };
  const conflict = ce.analyze(a, b);
  const child = se.synthesize(a, b, conflict);
  // bias toward A (0.9) → blended cost closer to 10 than 0
  assert.ok(child.action.field.cost > 5, `expected >5, got ${child.action.field.cost}`);
  assert.deepEqual(child.provenance.parents, ['A', 'B']);
});

test('regeneration: carries elites forward and adds syntheses', () => {
  const re = new RegenerationEngine({ elite: 1, pairs: 1 });
  const { nextGeneration, syntheses } = re.regenerate([
    { id: 'top', councilScore: 100, action: { field: { x: 10 } } },
    { id: 'second', councilScore: 60, action: { field: { x: 2 } } },
  ]);
  assert.ok(nextGeneration.some((c) => c.meta?.elite), 'elite carried forward');
  assert.equal(syntheses.length, 1, 'one synthesized child');
});

// ── Adaptive Mesh ──────────────────────────────────────────────────────────
test('adaptive mesh: reinforce strengthens, decay+prune remove dead links', () => {
  const mesh = new AdaptiveMesh({ learningRate: 0.5, decayRate: 0.5, pruneThreshold: 0.2 });
  mesh.addNode({ id: 'A' }).addNode({ id: 'B' }).addNode({ id: 'C' });
  mesh.reinforce('A', 'B');
  assert.ok(mesh.weight('A', 'B') > 0, 'reinforced link exists');
  mesh.connect('A', 'C', 0.1); // a weak link
  const removed = mesh.tick(); // decay halves weights, prune drops <0.2
  assert.ok(removed.pruned >= 1, 'weak link pruned');
  assert.ok(mesh.weight('A', 'B') > 0, 'strong link survives');
});

test('adaptive mesh: reinforceGroup wires a co-active set together', () => {
  const mesh = new AdaptiveMesh();
  ['A', 'B', 'C'].forEach((id) => mesh.addNode({ id }));
  mesh.reinforceGroup(['A', 'B', 'C']);
  assert.ok(mesh.weight('A', 'B') > 0);
  assert.ok(mesh.weight('B', 'C') > 0);
  assert.ok(mesh.weight('A', 'C') > 0);
});

test('adaptive mesh: maxDegree drops the weakest edge', () => {
  const mesh = new AdaptiveMesh({ maxDegree: 1 });
  ['A', 'B', 'C'].forEach((id) => mesh.addNode({ id }));
  mesh.connect('A', 'B', 0.9);
  mesh.connect('A', 'C', 0.2); // exceeds degree 1 → weakest (A-C) dropped
  assert.equal(mesh.weight('A', 'B'), 0.9);
  assert.equal(mesh.weight('A', 'C'), 0);
});

// ── Resource Manager ───────────────────────────────────────────────────────
test('resource manager: affordableCount respects remaining budget', () => {
  const rm = new ResourceManager({ maxRollouts: 10, maxCycles: 1, minPerRound: 1 });
  assert.ok(rm.affordableCount(100) <= 10, 'never exceeds the budget');
  rm.charge(10);
  assert.equal(rm.affordableCount(5), 0, 'nothing left to spend');
});

test('resource manager: stops on cycle and rollout exhaustion', () => {
  const rm = new ResourceManager({ maxRollouts: 100, maxCycles: 2 });
  assert.equal(rm.shouldContinue().continue, true);
  rm.tickCycle(); rm.tickCycle();
  assert.equal(rm.shouldContinue().continue, false, 'cycle cap reached');
  assert.match(rm.shouldContinue().reason, /cycle/);
});

test('resource manager: goalReached short-circuits', () => {
  const rm = new ResourceManager();
  const gate = rm.shouldContinue({ goalReached: true });
  assert.equal(gate.continue, false);
  assert.match(gate.reason, /goal/);
});

// ── Full CognitiveMesh loop ────────────────────────────────────────────────
test('cognitive mesh: runs the full loop without touching reality', () => {
  const { world, simulator } = makeSim();
  const mesh = new CognitiveMesh({ simulator, config: { beamWidth: 8 } });
  const result = mesh.run('grow the portfolio while keeping risk low');

  assert.ok(result.best, 'produced a best candidate');
  assert.ok(result.cycles.length >= 1, 'ran at least one cycle');
  assert.ok(result.mesh.nodes.length > 0, 'built a thought-mesh');
  assert.ok(result.mesh.edges.length > 0, 'formed weighted connections');
  assert.equal(world.getField('wealth'), 100, 'imagination never touched reality');
  assert.ok(['completed', 'converged (no new improvement)', 'cycle budget exhausted', 'rollout budget exhausted']
    .includes(result.stopReason), `unexpected stop reason: ${result.stopReason}`);
});

test('cognitive mesh: respects a tight resource budget', () => {
  const { simulator } = makeSim();
  const mesh = new CognitiveMesh({
    simulator,
    resources: new ResourceManager({ maxRollouts: 20, maxCycles: 10 }),
  });
  const result = mesh.run('anything');
  assert.ok(result.resources.spentRollouts <= 20, 'stayed within the rollout budget');
});

test('cognitive mesh: a custom generator seeds the loop', () => {
  const { simulator } = makeSim();
  let called = false;
  const mesh = new CognitiveMesh({
    simulator,
    generate: () => { called = true; return [{ id: 'custom', action: { field: { wealth: 500 } } }]; },
  });
  mesh.run('use my seed');
  assert.ok(called, 'custom generator was invoked');
});
