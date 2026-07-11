// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/orchestrator/goalManager.js — manage many goals by priority.
//
// The Planner decomposes ONE goal into steps. The GoalManager sits above it: it holds
// MANY goals, scores each by priority (importance × urgency, decaying with age), and
// hands them out highest-first. It tracks each goal's lifecycle (pending → active →
// done/failed) so an agent can juggle competing objectives instead of just one.
//
//   const gm = new GoalManager();
//   gm.add('analyze Samsung stock', { importance: 0.9, urgency: 0.8 });
//   gm.add('write weekly summary',  { importance: 0.5, deadline: Date.now() + 3600e3 });
//   const next = gm.next();          // → the highest-priority pending goal
//   gm.complete(next.id);            // mark it done
//
// Dependency-free. Pair it with the Planner: gm.next() → planner.execute(goal.text, ...).

const clamp01 = (v) => Math.max(0, Math.min(1, v));

let _seq = 0;

export class GoalManager {
  /**
   * @param {{ agingHalfLifeMs?: number }} [opts]
   *   agingHalfLifeMs: how fast a waiting goal's urgency grows (older = more urgent).
   *   Default 1h — a goal waiting an hour gets a meaningful urgency bump.
   */
  constructor(opts = {}) {
    this.agingHalfLifeMs = opts.agingHalfLifeMs ?? 3600_000;
    this._goals = new Map(); // id → goal record
  }

  /**
   * Add a goal.
   * @param {string} text
   * @param {{ importance?: number, urgency?: number, deadline?: number, meta?: object }} [opts]
   * @returns {object} the created goal record
   */
  add(text, opts = {}) {
    const t = (text ?? '').toString().trim();
    if (!t) return null;
    const goal = {
      id: `g${++_seq}`,
      text: t,
      importance: clamp01(opts.importance ?? 0.5),
      urgency: clamp01(opts.urgency ?? 0.5),
      deadline: typeof opts.deadline === 'number' ? opts.deadline : null,
      meta: opts.meta ?? {},
      status: 'pending', // pending | active | done | failed
      createdAt: Date.now(),
    };
    this._goals.set(goal.id, goal);
    return goal;
  }

  /**
   * Current priority score (0~1+) for a goal. Combines importance, urgency, how long
   * it's been waiting (aging), and deadline pressure. Higher = do it sooner.
   */
  priority(goal, now = Date.now()) {
    const ageMs = now - goal.createdAt;
    // aging: waiting goals slowly gain urgency (bounded to +0.5)
    const aging = 0.5 * (1 - Math.pow(2, -ageMs / this.agingHalfLifeMs));
    // deadline pressure: ramps up as the deadline approaches (and spikes if overdue)
    let deadlinePressure = 0;
    if (goal.deadline !== null) {
      const remaining = goal.deadline - now;
      if (remaining <= 0) deadlinePressure = 1; // overdue → max pressure
      else deadlinePressure = clamp01(1 - remaining / this.agingHalfLifeMs);
    }
    // weighted blend — importance leads, then live urgency signals
    return (
      goal.importance * 0.5 +
      goal.urgency * 0.2 +
      aging * 0.15 +
      deadlinePressure * 0.15
    );
  }

  /** All pending goals, highest priority first. */
  pending(now = Date.now()) {
    return [...this._goals.values()]
      .filter((g) => g.status === 'pending')
      .map((g) => ({ ...g, score: this.priority(g, now) }))
      .sort((a, b) => b.score - a.score);
  }

  /** Peek at (and mark active) the highest-priority pending goal. */
  next(now = Date.now()) {
    const top = this.pending(now)[0];
    if (!top) return null;
    const goal = this._goals.get(top.id);
    goal.status = 'active';
    return { ...goal, score: top.score };
  }

  complete(id) { return this._setStatus(id, 'done'); }
  fail(id) { return this._setStatus(id, 'failed'); }

  /** Put an active goal back into the pending pool (e.g. to retry later). */
  requeue(id) { return this._setStatus(id, 'pending'); }

  _setStatus(id, status) {
    const g = this._goals.get(id);
    if (!g) return null;
    g.status = status;
    g.updatedAt = Date.now();
    return g;
  }

  get(id) { return this._goals.get(id) ?? null; }

  /** Counts by status — a quick dashboard of the agent's workload. */
  stats() {
    const s = { pending: 0, active: 0, done: 0, failed: 0, total: this._goals.size };
    for (const g of this._goals.values()) s[g.status]++;
    return s;
  }

  /** Remove finished goals (done + failed) to keep the store small. */
  prune() {
    let removed = 0;
    for (const [id, g] of this._goals) {
      if (g.status === 'done' || g.status === 'failed') { this._goals.delete(id); removed++; }
    }
    return removed;
  }

  clear() { this._goals.clear(); }
}
