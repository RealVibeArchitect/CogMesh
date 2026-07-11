// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// test/rolloutCache.test.mjs — cache-based incremental reasoning.
//
//   node --test test/rolloutCache.test.mjs
//
// The cache must be *transparent*: same answers as the raw simulator, just fewer real
// computations. These tests pin correctness (identical results, no cache corruption),
// the LRU bound, key stability, and the CognitiveMesh integration.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { WorldModel, WorldSimulator } from '../core/world/index.js';
import { RolloutCache, CognitiveMesh, ResourceManager } from '../core/cognition/index.js';

function makeSim() {
  const world = new WorldModel();
  world.setField('wealth', 100);
  world.setField('risk', 0.3);
  return new WorldSimulator(world, { goalWeights: { wealth: 1, risk: -20 } });
}

test('cache: returns identical score/future to the raw simulator', () => {
  const raw = makeSim();
  const cached = new RolloutCache(makeSim());
  const action = { field: { wealth: 200 } };
  const a = raw.rollout(action);
  const b = cached.rollout(action);
  assert.equal(a.score, b.score);
  assert.deepEqual(a.future, b.future);
});

test('cache: a repeated action is a hit and is not recomputed', () => {
  let real = 0;
  const base = makeSim();
  const orig = base.rollout.bind(base);
  base.rollout = (a, o) => { real++; return orig(a, o); };
  const cached = new RolloutCache(base);

  const action = { field: { wealth: 150 } };
  cached.rollout(action);
  cached.rollout(action);
  cached.rollout(action);

  assert.equal(real, 1, 'only one real simulation for three identical calls');
  assert.equal(cached.stats().hits, 2);
  assert.equal(cached.stats().misses, 1);
});

test('cache: key is order-independent (stable stringify)', () => {
  let real = 0;
  const base = makeSim();
  const orig = base.rollout.bind(base);
  base.rollout = (a, o) => { real++; return orig(a, o); };
  const cached = new RolloutCache(base);

  cached.rollout({ field: { wealth: 100, risk: 0.2 } });
  cached.rollout({ field: { risk: 0.2, wealth: 100 } }); // same, keys reordered
  assert.equal(real, 1, 'reordered keys hit the same cache entry');
});

test('cache: different steps are different entries', () => {
  let real = 0;
  const base = makeSim();
  const orig = base.rollout.bind(base);
  base.rollout = (a, o) => { real++; return orig(a, o); };
  const cached = new RolloutCache(base);
  cached.rollout({ field: { wealth: 100 } }, { steps: 1 });
  cached.rollout({ field: { wealth: 100 } }, { steps: 3 });
  assert.equal(real, 2, 'steps is part of the cache key');
});

test('cache: a mutated returned future cannot corrupt the cache', () => {
  const cached = new RolloutCache(makeSim());
  const action = { field: { wealth: 200 } };
  const first = cached.rollout(action);
  assert.throws(() => { first.future.field.wealth = -999; }, 'future is frozen');
  const second = cached.rollout(action);
  assert.equal(second.score, first.score, 'cache entry intact after mutation attempt');
});

test('cache: LRU evicts the oldest entry past capacity', () => {
  const cached = new RolloutCache(makeSim(), { max: 2 });
  cached.rollout({ field: { wealth: 1 } });
  cached.rollout({ field: { wealth: 2 } });
  cached.rollout({ field: { wealth: 3 } }); // evicts wealth:1
  assert.ok(cached.stats().size <= 2, 'never exceeds capacity');
});

test('cache: invalidate clears everything', () => {
  const cached = new RolloutCache(makeSim());
  cached.rollout({ field: { wealth: 1 } });
  cached.invalidate();
  assert.equal(cached.stats().size, 0);
});

test('cache: exposes the wrapped world for callers that reach through', () => {
  const base = makeSim();
  const cached = new RolloutCache(base);
  assert.equal(cached.world, base.world);
  assert.equal(cached.world.getField('wealth'), 100);
});

test('cache: CognitiveMesh uses it by default and stays correct', () => {
  const base = makeSim();
  const mesh = new CognitiveMesh({
    simulator: base,
    resources: new ResourceManager({ maxRollouts: 100000, maxCycles: 6 }),
    config: { beamWidth: 12 },
  });
  const result = mesh.run('grow the portfolio');
  assert.ok(result.best, 'still produces a result');
  assert.ok(mesh.simulator instanceof RolloutCache, 'simulator was auto-wrapped');
  assert.ok(mesh.simulator.stats().hitRate > 0.5, 'most rollouts were cache hits');
});

test('cache: config.cache=false opts out', () => {
  const base = makeSim();
  const mesh = new CognitiveMesh({
    simulator: base,
    config: { cache: false },
  });
  assert.equal(mesh.simulator, base, 'no cache wrapper when disabled');
});

test('cache: an already-cached simulator is not double-wrapped', () => {
  const cached = new RolloutCache(makeSim());
  const mesh = new CognitiveMesh({ simulator: cached });
  assert.equal(mesh.simulator, cached, 'reuses the existing cache');
});
