// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/cognition/ResourceManager.js — spend compute where it pays off.
//
// The mesh's parallelism is unbounded in principle (N candidates → N futures → …), so it
// MUST be governed. The ResourceManager tracks a budget (time, rollouts, tokens) and makes
// two decisions the document asks for:
//   1. admission — how many candidates can we afford to simulate this round?
//   2. termination — stop the whole cycle when the budget or the goal is exhausted.
//
// It also implements adaptive allocation: give more of the remaining budget to a round
// when candidates look promising (high scores/agreement), less when they look weak — so
// resources concentrate on high-probability branches and low-probability ones die early.
//
// This complements — does not replace — the existing orchestrator/boundedRationality.js,
// which decides how many *tokens* one engine call gets. This governs the *mesh cycle*.

const num = (v, d = 0) => (Number.isFinite(v) ? v : d);

export class ResourceManager {
  /**
   * @param {{ maxRollouts?:number, maxCycles?:number, maxMillis?:number,
   *           costPerRollout?:number, minPerRound?:number }} [opts]
   *   maxRollouts:  total simulations allowed across the whole run
   *   maxCycles:    hard cap on generate→…→regenerate cycles
   *   maxMillis:    wall-clock budget (0 = ignore time)
   *   costPerRollout: rollout units charged per simulated node (default 1)
   *   minPerRound:  always admit at least this many nodes if any budget remains
   */
  constructor(opts = {}) {
    this.maxRollouts = num(opts.maxRollouts, 500);
    this.maxCycles = num(opts.maxCycles, 6);
    this.maxMillis = num(opts.maxMillis, 0);
    this.costPerRollout = Math.max(1e-6, num(opts.costPerRollout, 1));
    this.minPerRound = Math.max(1, num(opts.minPerRound, 4));
    this.reset();
  }

  reset() {
    this.spentRollouts = 0;
    this.cycles = 0;
    this.startedAt = Date.now();
    this.log = [];
    return this;
  }

  get remainingRollouts() { return Math.max(0, this.maxRollouts - this.spentRollouts); }
  get elapsedMs() { return Date.now() - this.startedAt; }

  /** Fraction of the total budget still available (0~1) — drives adaptive allocation. */
  get budgetFraction() {
    return this.maxRollouts > 0 ? this.remainingRollouts / this.maxRollouts : 0;
  }

  /**
   * How many nodes can this round afford? Base capacity = remaining / cost, but we don't
   * blow the whole budget on one round: cap it at a share that leaves room for later
   * cycles. `promise` (0~1) lets a promising round claim a bigger share.
   * @param {number} requested  how many nodes the round *wants* to simulate
   * @param {{ promise?: number }} [opts]
   */
  affordableCount(requested, opts = {}) {
    const want = Math.max(0, Math.floor(num(requested, 0)));
    if (want === 0) return 0;
    const capacity = Math.floor(this.remainingRollouts / this.costPerRollout);
    if (capacity <= 0) return 0;

    // reserve budget for the cycles we haven't run yet, unless this round looks promising
    const cyclesLeft = Math.max(1, this.maxCycles - this.cycles);
    const promise = clamp01(opts.promise ?? 0.5);
    const share = (1 / cyclesLeft) + promise * (1 - 1 / cyclesLeft); // 1/cyclesLeft … 1
    const budgeted = Math.max(this.minPerRound, Math.floor(capacity * share));

    return Math.min(want, capacity, budgeted);
  }

  /** Charge the budget for `count` rollouts actually performed. */
  charge(count) {
    const c = Math.max(0, Math.floor(num(count, 0)));
    this.spentRollouts += c * this.costPerRollout;
    return this;
  }

  /** Mark one full cognitive cycle complete. */
  tickCycle(info = {}) {
    this.cycles++;
    this.log.push({ cycle: this.cycles, spent: this.spentRollouts, elapsedMs: this.elapsedMs, ...info });
    return this;
  }

  /**
   * Should the mesh keep cycling? Stops on cycle cap, rollout budget, wall-clock, or an
   * explicit goal-reached / convergence signal from the caller.
   * @param {{ goalReached?:boolean, converged?:boolean }} [signals]
   * @returns {{ continue:boolean, reason:string }}
   */
  shouldContinue(signals = {}) {
    if (signals.goalReached) return stop('goal reached');
    if (signals.converged) return stop('converged (no new improvement)');
    if (this.cycles >= this.maxCycles) return stop('cycle budget exhausted');
    if (this.remainingRollouts <= 0) return stop('rollout budget exhausted');
    if (this.maxMillis > 0 && this.elapsedMs >= this.maxMillis) return stop('time budget exhausted');
    return { continue: true, reason: 'budget available' };
  }

  /** A compact status object for logging / UI. */
  status() {
    return {
      cycles: this.cycles,
      spentRollouts: this.spentRollouts,
      remainingRollouts: this.remainingRollouts,
      budgetFraction: Math.round(this.budgetFraction * 1000) / 1000,
      elapsedMs: this.elapsedMs,
    };
  }
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const stop = (reason) => ({ continue: false, reason });
