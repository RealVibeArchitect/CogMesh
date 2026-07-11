// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/cognition/StabilityGuard.js — keep the self-improvement loop honest.
//
// The mesh improves by regenerating candidates each cycle and feeding them back. Left
// unguarded, that loop has failure modes — the one confirmed by stress-testing is candidate
// POISONING: a NaN/Infinity score (from a bad scoreFn, a divide-by-zero in a rollout, etc.)
// can slip into the ranked pool and, in the wrong conditions, become synthesis feedstock that
// contaminates every later candidate. Other classic risks: silent regression of the working
// set, and stagnation that a single-epsilon check misses.
//
// StabilityGuard is a small, pure supervisor the CognitiveMesh consults each cycle:
//
//   sanitize(candidates)      drop/return non-finite candidates so poison never propagates
//   record(bestScore)         track the improvement trajectory (for patience & diagnostics)
//   verdict()                 → { stop, reason, trend } — stagnation via PATIENCE, not one eps
//
// "Patience" (borrowed from early-stopping) is more robust than "did this one cycle improve":
// the loop only stops after `patience` consecutive cycles without meaningful improvement, so a
// single flat cycle amid real progress doesn't end things prematurely, and true plateaus do.

const isFiniteNum = (v) => typeof v === 'number' && Number.isFinite(v);

export class StabilityGuard {
  /**
   * @param {{ patience?:number, minDelta?:number, maxRegressions?:number }} [opts]
   *   patience:       consecutive non-improving cycles tolerated before stopping (default 2)
   *   minDelta:       improvement smaller than this counts as "no improvement" (default 1e-6)
   *   maxRegressions: consecutive best-score drops tolerated before flagging instability
   *                   (default 3). A drop shouldn't happen if best is preserved — if it does,
   *                   something upstream is wrong and we stop rather than thrash.
   */
  constructor(opts = {}) {
    this.patience = Number.isFinite(opts.patience) ? Math.max(1, opts.patience) : 2;
    this.minDelta = Number.isFinite(opts.minDelta) ? opts.minDelta : 1e-6;
    this.maxRegressions = Number.isFinite(opts.maxRegressions) ? opts.maxRegressions : 3;
    this.reset();
  }

  reset() {
    this.history = [];        // best score after each recorded cycle
    this._stale = 0;          // consecutive non-improving cycles
    this._regressions = 0;    // consecutive drops
    this._best = -Infinity;
    this.dropped = 0;         // total poisoned candidates removed
    return this;
  }

  /**
   * Remove non-finite candidates (NaN/Infinity score or councilScore, or an action carrying
   * a non-finite field). Returns only the clean ones; poisoned count is tracked. This is the
   * fix for the confirmed poisoning failure mode — it runs BEFORE ranking/synthesis so bad
   * scores can never become feedstock.
   * @param {Array} candidates
   * @returns {{ clean:Array, removed:Array }}
   */
  sanitize(candidates) {
    const list = Array.isArray(candidates) ? candidates : [];
    const clean = [], removed = [];
    for (const c of list) {
      if (this._isClean(c)) clean.push(c);
      else { removed.push(c); this.dropped++; }
    }
    return { clean, removed };
  }

  _isClean(c) {
    if (!c || typeof c !== 'object') return false;
    if (c.score !== undefined && !isFiniteNum(c.score)) return false;
    if (c.councilScore !== undefined && !isFiniteNum(c.councilScore)) return false;
    const field = c.action && c.action.field;
    if (field) {
      for (const v of Object.values(field)) {
        if (typeof v === 'number' && !Number.isFinite(v)) return false;
      }
    }
    return true;
  }

  /**
   * Record this cycle's global best score and update the trajectory. Non-finite scores are
   * ignored (they never advance the best).
   * @param {number} bestScore
   */
  record(bestScore) {
    const score = isFiniteNum(bestScore) ? bestScore : this._best;
    const improved = score > this._best + this.minDelta;

    if (improved) {
      if (score < this._best) this._regressions++; else this._regressions = 0;
      this._best = score;
      this._stale = 0;
    } else {
      this._stale++;
      // a real drop in best (shouldn't happen when best is preserved) is a regression signal
      if (isFiniteNum(bestScore) && bestScore < this._best - this.minDelta) this._regressions++;
      else this._regressions = 0;
    }
    this.history.push(score);
    return this;
  }

  /**
   * Should the loop stop for stability reasons?
   * @returns {{ stop:boolean, reason:string, trend:'improving'|'plateau'|'unstable' }}
   */
  verdict() {
    if (this._regressions >= this.maxRegressions) {
      return { stop: true, reason: 'instability: repeated best-score regression', trend: 'unstable' };
    }
    if (this._stale >= this.patience) {
      return { stop: true, reason: `plateau: no improvement for ${this._stale} cycles (patience ${this.patience})`, trend: 'plateau' };
    }
    return { stop: false, reason: 'improving', trend: 'improving' };
  }

  /** A compact diagnostics object for the run result. */
  status() {
    return {
      best: this._best === -Infinity ? null : this._best,
      cyclesRecorded: this.history.length,
      staleCycles: this._stale,
      poisonedDropped: this.dropped,
      trajectory: this.history.slice(),
      trend: this.verdict().trend,
    };
  }
}
