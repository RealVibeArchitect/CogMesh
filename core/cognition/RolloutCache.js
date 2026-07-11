// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/cognition/RolloutCache.js — cache-based incremental reasoning.
//
// Profiling the cognitive loop showed ~93% of WorldSimulator.rollout() calls repeat an
// action already simulated this run (the mesh re-simulates elite candidates every cycle,
// and identical perspective-nodes share one action). Since rollout is a PURE function of
// (action, steps) — same input, same future & score — those repeats are wasted compute.
//
// RolloutCache wraps any simulator and memoizes rollout by a stable key, turning the
// self-revising loop from "recompute everything each cycle" into incremental reasoning:
// only genuinely new actions cost a simulation. It's a transparent decorator — it exposes
// the same rollout()/imagine() surface, so callers (ParallelWorldSimulation, DeliberativeLoop)
// don't change. An LRU bound keeps memory flat over long runs.
//
//   const sim   = new WorldSimulator(world, { goalWeights });
//   const cached = new RolloutCache(sim, { max: 4096 });
//   new ParallelWorldSimulation(cached);   // ← drop-in; now rollouts are memoized
//
// Correctness guard: the cached `future` is deep-frozen before return, so a caller that
// mutates what it gets back can never corrupt the shared cache entry.

/** Stable stringify: sort object keys so {a,b} and {b,a} hash identically. */
function stableKey(action, steps) {
  return `${stableStringify(action)}|${steps}`;
}

function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const keys = Object.keys(v).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
}

/** Recursively freeze so a returned future can't be mutated into the cache. */
function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const k of Object.keys(obj)) deepFreeze(obj[k]);
  }
  return obj;
}

export class RolloutCache {
  /**
   * @param {{ rollout:Function, imagine?:Function, world?:object }} simulator  the wrapped simulator
   * @param {{ max?:number, freeze?:boolean }} [opts]
   *   max:    LRU capacity (entries). Default 4096. Oldest entries evict first.
   *   freeze: deep-freeze returned futures to protect the cache (default true).
   */
  constructor(simulator, opts = {}) {
    if (!simulator || typeof simulator.rollout !== 'function') {
      throw new Error('[RolloutCache] a simulator with rollout() is required');
    }
    this.simulator = simulator;
    this.max = Number.isFinite(opts.max) ? Math.max(1, opts.max) : 4096;
    this.freeze = opts.freeze !== false;
    this._cache = new Map();     // key → { score, future, action } (insertion order = LRU)
    // PERF: the mesh's dominant access pattern is the SAME action object repeated —
    // perspective nodes share one action reference and elites carry theirs across
    // cycles. Memoizing the computed string key per (action-ref × steps) turns the
    // hit path's stableStringify (O(action size), lots of string garbage) into two
    // O(1) map lookups. WeakMap keys never pin actions in memory.
    this._keyMemo = new WeakMap(); // action(object) → Map(steps → key)
    this.hits = 0;
    this.misses = 0;
  }

  /** Compute (or recall) the stable cache key for an (action, steps) pair. */
  _key(action, steps) {
    if (action !== null && typeof action === 'object') {
      let bySteps = this._keyMemo.get(action);
      if (bySteps) {
        const k = bySteps.get(steps);
        if (k !== undefined) return k;
      } else {
        bySteps = new Map();
        this._keyMemo.set(action, bySteps);
      }
      const k = stableKey(action, steps);
      bySteps.set(steps, k);
      return k;
    }
    return stableKey(action, steps);
  }

  /** Expose the wrapped world so callers using simulator.world keep working. */
  get world() { return this.simulator.world; }

  /**
   * Memoized rollout. Same (action, steps) → cached result. On a miss, delegates to the
   * real simulator, stores, and evicts the oldest entry if over capacity.
   */
  rollout(action, opts = {}) {
    const steps = Number.isFinite(opts.steps) ? opts.steps : 1;
    const key = this._key(action, steps);

    if (this._cache.has(key)) {
      this.hits++;
      // LRU touch: re-insert to mark most-recently-used
      const entry = this._cache.get(key);
      this._cache.delete(key);
      this._cache.set(key, entry);
      return entry;
    }

    this.misses++;
    const result = this.simulator.rollout(action, { steps });
    if (this.freeze) deepFreeze(result);
    this._cache.set(key, result);

    // LRU eviction: drop the oldest (first) entry when over capacity
    if (this._cache.size > this.max) {
      const oldest = this._cache.keys().next().value;
      this._cache.delete(oldest);
    }
    return result;
  }

  /**
   * imagine() over cached rollouts — mirrors WorldSimulator.imagine so this is a true
   * drop-in. Uses the memoized rollout under the hood.
   */
  imagine(actions, opts = {}) {
    const list = Array.isArray(actions) ? actions : [];
    if (list.length === 0) return { best: null, ranked: [], considered: 0 };
    const ranked = list.map((a) => this.rollout(a, opts)).sort((x, y) => y.score - x.score);
    return { best: ranked[0], ranked, considered: ranked.length };
  }

  /** Clear the cache (e.g. if the live world changed and old futures are stale). */
  invalidate() {
    this._cache.clear();
    return this;
  }

  /** Hit-rate stats for profiling. */
  stats() {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      size: this._cache.size,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }
}

export { stableKey, deepFreeze };
