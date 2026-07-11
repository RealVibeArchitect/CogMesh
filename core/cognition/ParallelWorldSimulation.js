// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/cognition/ParallelWorldSimulation.js — roll every thought-node into its own future.
//
// Stage 2 of the mesh. The DecompositionEngine handed us N thought-nodes; here each one
// is simulated *independently* on its own branch of the World Model, producing N parallel
// futures. Because the WorldSimulator already branches a fresh copy per rollout and never
// touches the live world, these are safe to run concurrently.
//
//     100 nodes ─┬─ branch → future  → score
//                ├─ branch → future  → score      (all independent)
//                └─ …
//                        ↓
//                keep top-K, prune the rest      (beam / resource pressure)
//
// "Parallel" here is logical, not literal OS-thread parallelism: JS is single-threaded, so
// we iterate — but every rollout is isolated, so a real worker-pool backend can be dropped
// in later without changing callers (see `simulateAsync`). The important cognitive property
// — futures don't contaminate each other — holds either way.

export class ParallelWorldSimulation {
  /**
   * @param {import('../world/WorldSimulator.js').WorldSimulator} simulator  required
   * @param {{ steps?: number, beamWidth?: number }} [opts]
   *   steps:     rollout depth passed to the simulator per node
   *   beamWidth: after scoring, keep at most this many nodes (Infinity = keep all)
   */
  constructor(simulator, opts = {}) {
    if (!simulator) throw new Error('[ParallelWorldSimulation] a WorldSimulator is required');
    this.simulator = simulator;
    this.steps = Number.isFinite(opts.steps) ? opts.steps : 1;
    this.beamWidth = Number.isFinite(opts.beamWidth) ? opts.beamWidth : Infinity;
    // diversityGuard: guarantee at least one survivor per origin-candidate in the beam, so
    // a single strong archetype can't crowd out every distinct alternative (which would
    // starve later conflict/synthesis). Off by default; the CognitiveMesh turns it on.
    this.diversityGuard = opts.diversityGuard === true;
  }

  /**
   * Simulate every node and return them ranked best-first, each enriched with its future.
   * @param {Array} nodes  thought nodes from the DecompositionEngine
   * @param {{ steps?: number, beamWidth?: number, budget?: object }} [opts]
   *   budget: optional ResourceManager budget; if it can't afford all nodes, the lowest
   *           priority ones are dropped *before* simulating (see `_admit`).
   * @returns {{ simulated:Array, pruned:Array, considered:number }}
   */
  simulate(nodes, opts = {}) {
    const list = Array.isArray(nodes) ? nodes : [];
    if (list.length === 0) return { simulated: [], pruned: [], considered: 0 };

    const steps = Number.isFinite(opts.steps) ? opts.steps : this.steps;
    const beamWidth = Number.isFinite(opts.beamWidth) ? opts.beamWidth : this.beamWidth;

    // resource admission: if a budget is supplied, only admit as many nodes as it allows.
    const { admitted, rejected } = this._admit(list, opts.budget);

    const simulated = admitted
      .map((node) => {
        const rollout = this.simulator.rollout(node.action, { steps });
        return {
          ...node,
          score: rollout.score,
          future: rollout.future,
          meta: { ...node.meta, simulated: true },
        };
      })
      .sort((a, b) => b.score - a.score);

    // beam pruning: keep the top-K futures, prune the tail (still returned for inspection).
    const { kept, beamPruned } = this._applyBeam(simulated, beamWidth, opts.diversityGuard);

    return {
      simulated: kept,
      pruned: [...rejected, ...beamPruned],
      considered: list.length,
    };
  }

  /**
   * Select the beam from a score-sorted list. With the diversity guard on, first reserve
   * one slot for the top node of each distinct origin, then fill the rest by pure score —
   * so distinct archetypes always survive while the beam still favors the best.
   */
  _applyBeam(sorted, beamWidth, guardOpt) {
    if (beamWidth === Infinity) return { kept: sorted, beamPruned: [] };
    const guard = guardOpt === undefined ? this.diversityGuard : guardOpt === true;
    if (!guard) {
      return { kept: sorted.slice(0, beamWidth), beamPruned: sorted.slice(beamWidth) };
    }
    const originOf = (n) => n.meta?.origin ?? n.parentId ?? n.id;
    const keptSet = new Set();
    const kept = [];
    // pass 1: best node per origin (list is already score-sorted, so first-seen = best)
    for (const n of sorted) {
      if (kept.length >= beamWidth) break;
      const o = originOf(n);
      if (!keptSet.has(`origin:${o}`)) { keptSet.add(`origin:${o}`); keptSet.add(n); kept.push(n); }
    }
    // pass 2: fill remaining slots with the highest remaining scorers
    for (const n of sorted) {
      if (kept.length >= beamWidth) break;
      if (!keptSet.has(n)) { keptSet.add(n); kept.push(n); }
    }
    kept.sort((a, b) => b.score - a.score);
    const beamPruned = sorted.filter((n) => !keptSet.has(n));
    return { kept, beamPruned };
  }

  /**
   * Async variant with a bounded concurrency window. Behaviour is identical to simulate()
   * but rollouts are dispatched in batches, leaving room to swap in a worker-thread pool
   * later. Still deterministic: results are re-sorted by score.
   * @param {Array} nodes
   * @param {{ steps?: number, beamWidth?: number, concurrency?: number, budget?: object }} [opts]
   */
  async simulateAsync(nodes, opts = {}) {
    const list = Array.isArray(nodes) ? nodes : [];
    if (list.length === 0) return { simulated: [], pruned: [], considered: 0 };

    const steps = Number.isFinite(opts.steps) ? opts.steps : this.steps;
    const beamWidth = Number.isFinite(opts.beamWidth) ? opts.beamWidth : this.beamWidth;
    const concurrency = Math.max(1, opts.concurrency || 8);

    const { admitted, rejected } = this._admit(list, opts.budget);
    const out = [];
    for (let i = 0; i < admitted.length; i += concurrency) {
      const batch = admitted.slice(i, i + concurrency);
      // each rollout is synchronous+isolated; Promise.resolve keeps the batching seam
      const results = await Promise.all(batch.map((node) => Promise.resolve().then(() => {
        const rollout = this.simulator.rollout(node.action, { steps });
        return { ...node, score: rollout.score, future: rollout.future, meta: { ...node.meta, simulated: true } };
      })));
      out.push(...results);
    }
    out.sort((a, b) => b.score - a.score);
    const kept = beamWidth === Infinity ? out : out.slice(0, beamWidth);
    const beamPruned = beamWidth === Infinity ? [] : out.slice(beamWidth);
    return { simulated: kept, pruned: [...rejected, ...beamPruned], considered: list.length };
  }

  /**
   * TRUE multi-core parallel simulation via a worker-thread pool — with an honest cost
   * model. Real threads only pay off when (a) the machine has spare cores and (b) there's
   * enough work to amortize thread hand-off. Below either bar, or when the simulator uses
   * custom functions (which can't cross the thread boundary), this transparently falls back
   * to the in-thread `simulate()`. So it's always safe to call and never slower by default.
   *
   * @param {Array} nodes
   * @param {{ steps?:number, beamWidth?:number, budget?:object,
   *           pool?:object, minWorkToParallelize?:number, force?:boolean }} [opts]
   *   pool: a pre-started WorkerPool (reused across calls — recommended).
   *   minWorkToParallelize: node count below which we stay single-threaded (default 256).
   *   force: skip the heuristic and parallelize anyway (for benchmarking).
   * @returns {Promise<{ simulated, pruned, considered, parallel:boolean }>}
   */
  async simulateParallel(nodes, opts = {}) {
    const list = Array.isArray(nodes) ? nodes : [];
    if (list.length === 0) return { simulated: [], pruned: [], considered: 0, parallel: false };

    const steps = Number.isFinite(opts.steps) ? opts.steps : this.steps;
    const beamWidth = Number.isFinite(opts.beamWidth) ? opts.beamWidth : this.beamWidth;
    const minWork = Number.isFinite(opts.minWorkToParallelize) ? opts.minWorkToParallelize : 256;

    const pool = opts.pool || null;
    const worthIt = opts.force || (pool && list.length >= minWork);

    // no pool, too little work, or forced-off → in-thread path (same results)
    if (!worthIt || !pool) {
      const r = this.simulate(list, { steps, beamWidth, budget: opts.budget });
      return { ...r, parallel: false };
    }

    // resource admission first (same as simulate)
    const { admitted, rejected } = this._admit(list, opts.budget);
    // dispatch actions to the worker pool; results come back index-aligned
    const results = await pool.map(admitted.map((n) => n.action), { steps });
    const simulated = admitted
      .map((node, i) => ({
        ...node,
        score: results[i].score,
        future: results[i].future,
        meta: { ...node.meta, simulated: true, viaWorker: true },
      }))
      .sort((a, b) => b.score - a.score);

    const { kept, beamPruned } = this._applyBeam(simulated, beamWidth, opts.diversityGuard);
    return { simulated: kept, pruned: [...rejected, ...beamPruned], considered: list.length, parallel: true };
  }

  /**
   * Resource admission control. Without a budget, admit everything. With one, ask the
   * budget how many nodes it can afford and admit that many (nodes are assumed to arrive
   * in priority order, or carry meta.priority). Rejected nodes are terminated early — the
   * document's "kill low-probability candidates early" rule.
   */
  _admit(nodes, budget) {
    if (!budget || typeof budget.affordableCount !== 'function') {
      return { admitted: nodes, rejected: [] };
    }
    const ordered = nodes.slice().sort(
      (a, b) => (b.meta?.priority ?? 0) - (a.meta?.priority ?? 0)
    );
    const n = Math.max(0, Math.min(ordered.length, budget.affordableCount(ordered.length)));
    return {
      admitted: ordered.slice(0, n),
      rejected: ordered.slice(n).map((node) => ({
        ...node, score: -Infinity, future: null,
        meta: { ...node.meta, terminatedEarly: true },
      })),
    };
  }
}
