// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// test/workerPool.test.mjs — true multi-core parallel rollouts.
//
//   node --test test/workerPool.test.mjs
//
// These spin up real OS threads, so each test tears its pool down in a finally block.
// The contract under test: parallel results are IDENTICAL to in-thread results (workers
// are an optimization, never a behavior change), the smart heuristic falls back correctly,
// and custom-function simulators are refused (functions can't cross the thread boundary).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { WorldModel, WorldSimulator } from '../core/world/index.js';
import { ParallelWorldSimulation, WorkerPool, describeSimulator } from '../core/cognition/index.js';

function makeSim() {
  const world = new WorldModel();
  for (let i = 0; i < 12; i++) world.setField('f' + i, (i + 1) * 10);
  return new WorldSimulator(world, { goalWeights: { f0: 1, f1: -5 } });
}
const nodes = (n) => Array.from({ length: n }, (_, i) => ({ id: 'n' + i, action: { field: { f0: 100 + i } }, meta: {} }));

test('describeSimulator: data-only sim is describable, custom-fn sim is not', () => {
  assert.ok(describeSimulator(makeSim()), 'goalWeights sim → describable');
  const custom = new WorldSimulator(new WorldModel(), { scoreFn: () => 1 });
  assert.equal(describeSimulator(custom), null, 'custom scoreFn → not describable');
});

test('worker pool: results are identical to in-thread rollouts', async () => {
  const sim = makeSim();
  const pws = new ParallelWorldSimulation(sim, { beamWidth: Infinity });
  const pool = new WorkerPool(describeSimulator(sim), { size: 2 });
  try {
    const list = nodes(64);
    const par = await pws.simulateParallel(list, { steps: 3, pool, force: true });
    const seq = pws.simulate(list, { steps: 3 });
    assert.equal(par.parallel, true, 'took the worker path');
    assert.equal(par.simulated.length, seq.simulated.length);
    // top scores must match exactly — workers are pure
    assert.ok(Math.abs(par.simulated[0].score - seq.simulated[0].score) < 1e-9);
    assert.equal(par.simulated[0].meta.viaWorker, true);
  } finally {
    await pool.destroy();
  }
});

test('worker pool: map preserves input order', async () => {
  const sim = makeSim();
  const pool = new WorkerPool(describeSimulator(sim), { size: 3 });
  try {
    const actions = nodes(50).map((n) => n.action);
    const results = await pool.map(actions, { steps: 1 });
    assert.equal(results.length, actions.length);
    // compare against direct rollout, index by index
    for (let i = 0; i < actions.length; i++) {
      const direct = sim.rollout(actions[i], { steps: 1 });
      assert.ok(Math.abs(results[i].score - direct.score) < 1e-9, `index ${i} aligned`);
    }
  } finally {
    await pool.destroy();
  }
});

test('smart fallback: small workloads stay single-threaded', async () => {
  const sim = makeSim();
  const pws = new ParallelWorldSimulation(sim, { beamWidth: Infinity });
  const pool = new WorkerPool(describeSimulator(sim), { size: 2 });
  try {
    // below minWorkToParallelize → in-thread despite a pool being present
    const r = await pws.simulateParallel(nodes(8), { steps: 1, pool, minWorkToParallelize: 256 });
    assert.equal(r.parallel, false, 'chose the in-thread path for a tiny workload');
    assert.equal(r.simulated.length, 8);
  } finally {
    await pool.destroy();
  }
});

test('smart fallback: no pool → in-thread, still correct', async () => {
  const sim = makeSim();
  const pws = new ParallelWorldSimulation(sim, { beamWidth: Infinity });
  const r = await pws.simulateParallel(nodes(500), { steps: 1 }); // no pool supplied
  assert.equal(r.parallel, false);
  assert.equal(r.simulated.length, 500);
});
