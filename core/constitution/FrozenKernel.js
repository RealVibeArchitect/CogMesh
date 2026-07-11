// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/constitution/FrozenKernel.js — the fixed invariant checker from CONSTITUTION-KERNEL.md.
//
// The Frozen Kernel checks a SMALL FIXED SET of structural/provenance invariants that hold regardless
// of how capable the system becomes. It guards the *preconditions of governance itself*, not good
// behavior. Every check is structural (signature / provenance / target / presence), so none scales
// with capability. Per the design, the kernel's remit is deliberately narrow and its checks total.
//
// Implemented invariants (subset of the 7; content of some remains a deferred typed hole):
//   INV-1  action ⇒ valid capability token
//   INV-2  self-mod ⇒ came via staging
//   INV-3  trajectory chain intact
//   INV-4  change ⇏ reduces oversight (targets governance components)
//   INV-5  power-increase ⇒ external anchor token present
//
// The kernel is frozen: no method mutates it, and it is Object.freeze'd.

import { verify } from './Capability.js';

export class FrozenKernel {
  /**
   * @param {object} deps
   * @param {import('./GovernanceTrajectory.js').GovernanceTrajectory} deps.trajectory
   * @param {Set<string>} [deps.governanceComponents] ids that must not be reduced (INV-4)
   */
  constructor({ trajectory, governanceComponents = new Set(['kernel', 'constitution', 'trajectory']) }) {
    this._trajectory = trajectory;
    this._governanceComponents = new Set(governanceComponents);
    Object.freeze(this._governanceComponents);
    Object.freeze(this);
  }

  /**
   * Screen a request against the fixed invariants. Total: always returns {pass, reason}.
   * @returns {{ pass:boolean, reason?:string }}
   */
  screen(request, _ctx) {
    // INV-3 trajectory chain intact — a forged/truncated history fails everything at once
    if (this._trajectory && !this._trajectory.verifyIntegrity()) {
      return { pass: false, reason: 'INV-3 trajectory chain integrity violated' };
    }

    // INV-1 action ⇒ valid token. Checked when a token IS presented (verifying an already-granted
    // capability). A gate call that is *requesting* authorization to later act carries no token yet;
    // it is the mint point, not the use point. So we reject only a token that is present-but-invalid,
    // not the absence of a token at mint time. (Token *use* at the effector boundary is where absence
    // is fatal — see verify() at the effector.)
    if (request.token) {
      if (!verify(request.token, request.action, request.args || {})) {
        return { pass: false, reason: 'INV-1 presented capability token is invalid for action' };
      }
    }

    // INV-2 self-mod ⇒ came via staging
    if (request.isSelfModification && !request.viaStaging) {
      return { pass: false, reason: 'INV-2 self-modification did not pass through staging' };
    }

    // INV-4 change ⇏ reduces oversight
    if (request.targetsComponent && this._governanceComponents.has(request.targetsComponent)) {
      if (request.reducesOversight) {
        return { pass: false, reason: `INV-4 change would reduce oversight of ${request.targetsComponent}` };
      }
    }

    // INV-5 power-increase ⇒ external anchor token present
    if (request.isPowerIncrease && !request.externalAnchorToken) {
      return { pass: false, reason: 'INV-5 power increase without external anchor token' };
    }

    return { pass: true };
  }

  /** The fixed set of governance components the kernel protects (read-only). */
  get protectedComponents() {
    return [...this._governanceComponents];
  }
}
