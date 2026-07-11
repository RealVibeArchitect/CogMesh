// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/constitution/ConstraintSet.js — the constraint lattice from CONSTITUTION-SPEC.md §2.2.
//
// The defining design property: THERE IS NO loosen() OPERATION. Monotonic tightening (constraints
// can only accumulate through a session, never widen) is enforced by *omission* — a module cannot
// widen the constraint set because the method to do so does not exist. This is how "PAD may only
// tighten" (and the review's monotonic-tightening rule) becomes structural, not a rule to remember.
//
// Two sub-lattices (resolving review DF-1):
//   - inviolable : the Safety Kernel floor. True most-restrictive-wins, never traded off.
//   - weighable  : principles that MAY be balanced, but only by the Conflict Resolution procedure
//                  (ConflictResolution.js), never silently.
//
// A ConstraintSet is immutable: tighten() and meet() return NEW sets. You never mutate one in place,
// so a held reference is a stable snapshot — the basis for gating against a consistent context.

let _seq = 0;

export class ConstraintSet {
  /**
   * @param {object} opts
   * @param {Set<string>} [opts.inviolable] active inviolable constraint ids (the floor)
   * @param {Set<string>} [opts.weighable]  active weighable principle ids
   */
  constructor({ inviolable = new Set(), weighable = new Set() } = {}) {
    this.id = `cs_${++_seq}`;
    this.inviolable = new Set(inviolable);
    this.weighable = new Set(weighable);
    Object.freeze(this.inviolable);
    Object.freeze(this.weighable);
    Object.freeze(this);
  }

  /** The empty (loosest) set — the lattice top. All tightening moves away from here. */
  static empty() {
    return new ConstraintSet();
  }

  /**
   * tighten: return a NEW set with additional constraints. The only way to change a set.
   * There is deliberately no inverse. Adding to either sub-lattice moves strictly downward
   * (more restrictive) in the lattice order.
   * @param {{ inviolable?: string[], weighable?: string[] }} delta
   * @returns {ConstraintSet}
   */
  tighten(delta = {}) {
    const inv = new Set(this.inviolable);
    const wgh = new Set(this.weighable);
    for (const c of delta.inviolable || []) inv.add(c);
    for (const c of delta.weighable || []) wgh.add(c);
    return new ConstraintSet({ inviolable: inv, weighable: wgh });
  }

  /**
   * meet: the most-restrictive combination of two sets (lattice meet). Used by most-restrictive-wins:
   * the union of all constraints from both. Never drops a constraint (that would be loosening).
   * @param {ConstraintSet} other
   * @returns {ConstraintSet}
   */
  meet(other) {
    return new ConstraintSet({
      inviolable: new Set([...this.inviolable, ...other.inviolable]),
      weighable: new Set([...this.weighable, ...other.weighable]),
    });
  }

  /** True if `other` is at least as restrictive as `this` (every constraint here is also there). */
  isRelaxedBy(other) {
    for (const c of this.inviolable) if (!other.inviolable.has(c)) return false;
    for (const c of this.weighable) if (!other.weighable.has(c)) return false;
    return true;
  }

  /** Does this set contain the given inviolable constraint? (used by the constraint check S3) */
  hasInviolable(id) {
    return this.inviolable.has(id);
  }

  has(id) {
    return this.inviolable.has(id) || this.weighable.has(id);
  }

  toJSON() {
    return { id: this.id, inviolable: [...this.inviolable], weighable: [...this.weighable] };
  }
}

// There is no `loosen`, no `remove`, no `delete`, no `clear`. This absence IS the guarantee.
