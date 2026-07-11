// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/constitution/Verdict.js — the orthogonal verdict basis from CONSTITUTION-SPEC.md §3.3.
//
// The four named verdicts (PROCEED / CONSTRAIN / REVISE / HALT) are DERIVED from a small basis:
//   { allow_bit, constraint_delta, return_addr }
// rather than being four independent primitives (resolves review UC-2). Fewer primitives, same
// coverage, easier to verify.

export const ALLOW = 'PROCEED';
export const DENY = 'HALT';

export class Verdict {
  /**
   * @param {object} o
   * @param {'PROCEED'|'HALT'} o.allow      the allow bit
   * @param {import('./ConstraintSet.js').ConstraintSet|null} [o.constraintDelta] added limits
   * @param {string|null} [o.returnAddr]    a pipeline stage to revise (for REVISE), else null
   * @param {string} [o.reason]             human-readable rationale (recorded to trajectory)
   * @param {boolean} [o.externalAnchorRequired] set when the system cannot decide alone
   */
  constructor({ allow, constraintDelta = null, returnAddr = null, reason = '', externalAnchorRequired = false }) {
    this.allow = allow;
    this.constraintDelta = constraintDelta;
    this.returnAddr = returnAddr;
    this.reason = reason;
    this.externalAnchorRequired = externalAnchorRequired;
    Object.freeze(this);
  }

  // ---- derived named verdicts ----
  /** PROCEED with no added constraints. */
  static proceed(reason = '') {
    return new Verdict({ allow: ALLOW, reason });
  }
  /** CONSTRAIN = PROCEED + a non-empty constraint delta. */
  static constrain(delta, reason = '') {
    return new Verdict({ allow: ALLOW, constraintDelta: delta, reason });
  }
  /** REVISE = deny this path + a return address to an earlier stage. */
  static revise(returnAddr, reason = '') {
    return new Verdict({ allow: DENY, returnAddr, reason });
  }
  /** HALT = refuse, no return address. */
  static halt(reason = '') {
    return new Verdict({ allow: DENY, reason });
  }
  /** Escalate to the external anchor (the system cannot soundly decide this itself). */
  static escalate(reason = '') {
    return new Verdict({ allow: DENY, externalAnchorRequired: true, reason });
  }

  // ---- classifiers ----
  get name() {
    if (this.externalAnchorRequired) return 'ESCALATE';
    if (this.allow === ALLOW) return this.constraintDelta ? 'CONSTRAIN' : 'PROCEED';
    return this.returnAddr ? 'REVISE' : 'HALT';
  }
  get permits() {
    return this.allow === ALLOW;
  }
}
