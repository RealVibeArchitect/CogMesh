// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/orchestrator/deliberativeLoop.js — think before acting.
//
// This is the closing of the loop the other modules were built for. Instead of acting
// on the first plan, the agent proposes several candidate plans, *simulates each one
// on the World Model*, evaluates the imagined outcomes, and only then commits to the
// best one — trial-and-error in imagination, not in reality.
//
//     goal
//      └─ propose N candidate plans        (Planner, or a custom proposer)
//           └─ simulate each on the world  (WorldSimulator: branch → rollout → score)
//                └─ evaluate the futures    (score + optional reflection)
//                     └─ commit to the best plan
//
// Dependency-free and composable: it takes a WorldSimulator and (optionally) a Planner.
// If you don't supply candidate plans, it asks the Planner to produce one and wraps it.

export class DeliberativeLoop {
  /**
   * @param {object} deps
   * @param {import('../world/WorldSimulator.js').WorldSimulator} deps.simulator  required
   * @param {import('./planner.js').Planner} [deps.planner]  optional plan source
   * @param {(candidate:object, rollout:object)=>number} [deps.evaluate]
   *        optional extra scorer applied to each simulated candidate; its value is
   *        ADDED to the simulator's own score (e.g. to fold in confidence/reflection).
   */
  constructor({ simulator, planner = null, evaluate = null } = {}) {
    if (!simulator) throw new Error('[DeliberativeLoop] a WorldSimulator is required');
    this.simulator = simulator;
    this.planner = planner;
    this._evaluate = typeof evaluate === 'function' ? evaluate : null;
  }

  /**
   * Deliberate over candidate plans and return the best, with the full comparison.
   *
   * @param {Array<{ id?:string, action:object }>} candidates
   *        Each candidate pairs a label/plan with an `action` the simulator can apply.
   * @param {{ steps?: number }} [opts]
   * @returns {{ chosen:object|null, ranked:Array, considered:number }}
   */
  deliberate(candidates, opts = {}) {
    const list = Array.isArray(candidates) ? candidates : [];
    if (list.length === 0) return { chosen: null, ranked: [], considered: 0 };

    const ranked = list
      .map((candidate) => {
        const rollout = this.simulator.rollout(candidate.action, opts);
        let score = rollout.score;
        if (this._evaluate) score += this._evaluate(candidate, rollout);
        return { candidate, action: candidate.action, score, future: rollout.future };
      })
      .sort((a, b) => b.score - a.score);

    return { chosen: ranked[0], ranked, considered: ranked.length };
  }

  /**
   * Full pipeline from a goal: decompose it (via the Planner) into one plan, expand it
   * into candidate action-variants with `expand`, simulate them, and pick the best.
   *
   * @param {string} goal
   * @param {(plan:object)=>Array<{id?:string,action:object}>} expand
   *        turns the planner's plan into concrete candidate actions to simulate.
   * @param {{ steps?: number }} [opts]
   */
  deliberateGoal(goal, expand, opts = {}) {
    if (!this.planner) throw new Error('[DeliberativeLoop] no Planner provided for deliberateGoal');
    if (typeof expand !== 'function') throw new Error('[DeliberativeLoop] expand(plan) function is required');
    const plan = this.planner.plan(goal);
    const candidates = expand(plan) || [];
    const result = this.deliberate(candidates, opts);
    return { goal: plan.goal, strategy: plan.strategy, ...result };
  }
}
