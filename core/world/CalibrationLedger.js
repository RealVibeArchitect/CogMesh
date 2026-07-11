// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/world/CalibrationLedger.js — bound the oracle's trust by its measured track record (S-1).
//
// THE PROBLEM (review S-1, the oracle problem):
//   Pre-action governance leans on the World Model foreseeing consequences, but "the
//   architecture never bounds the World Model's fallibility. Governance is only as good as
//   prediction, and prediction is treated as trustworthy." A planner that mispredicts can
//   walk an irreversible action through a gate that trusted the prediction.
//
// THE MECHANISM (a bounded, honest answer — not a solution to prediction in general):
//   Stop treating prediction as uniformly trustworthy. Instead, MEASURE it per action-class and
//   let the measured calibration gate irreversible actions:
//
//     record(actionClass, predicted, actual)  → accumulate a calibration score per class
//     trust(actionClass)                        → { calibrated:boolean, score, n, reason }
//
//   The rule the governance layer enforces: an irreversible action in a class with NO measured
//   track record, or a POORLY calibrated one, does not get to rely on the oracle — it must
//   route to the external anchor (fail-closed), exactly as an unclassifiable change does. Trust
//   is earned per class by demonstrated accuracy, not assumed globally.
//
//   This converts S-1's "prediction is trusted" into "prediction is trusted only where its
//   track record has been measured and is good." The oracle's fallibility is now bounded by data.
//
// TAMPER-EVIDENCE (this ledger is itself an attack surface):
//   If the agent could write its own accuracy record, it would fabricate calibration to open the
//   irreversible-action gate — the S-1 hole would just move. So, like the GovernanceTrajectory,
//   the ledger is HASH-CHAINED and append-only, and in the isolated deployment it lives inside
//   the adjudicator worker (the reasoning process cannot reach it). verifyIntegrity() detects any
//   forged or dropped record; a broken chain makes EVERY class read as uncalibrated (fail-closed).
//
// Calibration score: a bounded accuracy in [0,1] per class. For a class, we track the mean
// normalized error between predicted and actual outcomes; score = 1 − mean_error (clamped).
// A class needs a minimum sample count before it can be considered calibrated at all (few
// samples ⇒ not yet trustworthy, regardless of the running mean).

import { createHash } from 'node:crypto';

const GENESIS = 'calibration-genesis';

function hashRecord(prevHash, payload) {
  return createHash('sha256').update(prevHash).update(JSON.stringify(payload)).digest('hex');
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export class CalibrationLedger {
  /**
   * @param {{ minSamples?:number, calibratedThreshold?:number }} [opts]
   *   minSamples:           a class must have at least this many records to be judged (default 8)
   *   calibratedThreshold:  minimum score to count as calibrated (default 0.7)
   */
  constructor({ minSamples = 8, calibratedThreshold = 0.7 } = {}) {
    this.minSamples = Math.max(1, minSamples);
    this.calibratedThreshold = clamp01(calibratedThreshold);
    this._entries = [];                 // hash-chained append-only records
    this._byClass = new Map();          // actionClass → { n, errSum }
  }

  /**
   * Record one prediction↔outcome pair for an action class. Both are normalized error inputs:
   * pass a scalar `error` in [0,1] directly, OR pass predicted+actual+scale and we compute
   * |predicted − actual| / scale, clamped. Appended to the hash chain.
   * @param {string} actionClass
   * @param {{ error?:number, predicted?:number, actual?:number, scale?:number }} outcome
   * @returns {string} the new head hash
   */
  record(actionClass, outcome = {}) {
    const err = normalizeError(outcome);
    const prevHash = this._entries.length ? this._entries[this._entries.length - 1].hash : GENESIS;
    const payload = { seq: this._entries.length, at: Date.now(), actionClass, error: err };
    const hash = hashRecord(prevHash, payload);
    this._entries.push(Object.freeze({ ...payload, prevHash, hash }));

    const agg = this._byClass.get(actionClass) || { n: 0, errSum: 0 };
    agg.n += 1;
    agg.errSum += err;
    this._byClass.set(actionClass, agg);
    return hash;
  }

  /**
   * Is prediction for this action class trustworthy enough to rely on for an irreversible action?
   * Fails closed: unknown class, too few samples, poor score, or a broken chain ⇒ NOT calibrated.
   * @param {string} actionClass
   * @returns {{ calibrated:boolean, score:number, n:number, reason:string }}
   */
  trust(actionClass) {
    if (!this.verifyIntegrity()) {
      return { calibrated: false, score: 0, n: 0, reason: 'ledger integrity violated — fail closed' };
    }
    const agg = this._byClass.get(actionClass);
    if (!agg || agg.n === 0) {
      return { calibrated: false, score: 0, n: 0, reason: `no track record for class '${actionClass}'` };
    }
    const score = clamp01(1 - agg.errSum / agg.n);
    if (agg.n < this.minSamples) {
      return { calibrated: false, score, n: agg.n, reason: `only ${agg.n}/${this.minSamples} samples — not yet trustworthy` };
    }
    if (score < this.calibratedThreshold) {
      return { calibrated: false, score, n: agg.n, reason: `score ${score.toFixed(3)} below threshold ${this.calibratedThreshold}` };
    }
    return { calibrated: true, score, n: agg.n, reason: 'calibrated' };
  }

  /** Verify the hash chain (any forged/dropped record breaks it → everything reads uncalibrated). */
  verifyIntegrity() {
    let prevHash = GENESIS;
    for (const e of this._entries) {
      const payload = { seq: e.seq, at: e.at, actionClass: e.actionClass, error: e.error };
      if (e.prevHash !== prevHash) return false;
      if (e.hash !== hashRecord(prevHash, payload)) return false;
      prevHash = e.hash;
    }
    return true;
  }

  /** Per-class calibration summary (for monitoring / the run result). Read-only. */
  report() {
    const out = {};
    for (const [cls, agg] of this._byClass) {
      const score = clamp01(1 - agg.errSum / agg.n);
      out[cls] = { n: agg.n, score: +score.toFixed(4), calibrated: this.trust(cls).calibrated };
    }
    return out;
  }

  get size() { return this._entries.length; }
}

/** Normalize an outcome to a bounded error in [0,1]. */
function normalizeError({ error, predicted, actual, scale }) {
  if (Number.isFinite(error)) return clamp01(error);
  if (Number.isFinite(predicted) && Number.isFinite(actual)) {
    const s = Number.isFinite(scale) && scale > 0 ? scale : Math.max(1, Math.abs(predicted), Math.abs(actual));
    return clamp01(Math.abs(predicted - actual) / s);
  }
  // no usable signal ⇒ treat as maximal error (fail-closed: unmeasured ≠ accurate)
  return 1;
}
