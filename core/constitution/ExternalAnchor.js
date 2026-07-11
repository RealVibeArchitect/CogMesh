// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/constitution/ExternalAnchor.js — the external anchor interface from CONSTITUTION-RESIDUES.md
// (W-3) and CONSTITUTION-CERTIFICATES.md (Part A).
//
// The review established TWO DISTINCT external dependencies that must stay separate (merging them
// smuggles the W-1 circularity into the trust root):
//
//   • TRUST REFERENCE (W-3, passive)  — "is the kernel genuine?" A minimal, externalized, tamper-
//     evident comparison of a live measurement against a stored reference. It JUDGES NOTHING; it
//     only compares. This is the root of trust.
//   • POWER AUTHORITY (W-1, active)   — "may the system increase its power / extend its catalog?"
//     An active judgment, invoked rarely, only at the genuine frontier.
//
// This interface keeps them separate (two methods with sharply different contracts) and makes the
// irreducible trust explicit rather than hidden: the reference measurement is the declared axiom.
//
// HONEST LIMIT (W-3a/b, THREAT_MODEL §4): the anchor itself must be trusted — it is the one thing
// taken on faith. This code minimizes it (a single stored measurement) and externalizes it (held
// outside the governed runtime), but does not and cannot verify it. That is the axiom, declared.

/**
 * Base class / contract for an external anchor. A real deployment supplies a concrete anchor whose
 * custody (who holds the reference, how attestation is transported unforgeably) is an out-of-band,
 * institutional matter — see THREAT_MODEL.md §4.1. This class provides the SHAPE and a reference
 * in-process implementation for testing.
 */
export class ExternalAnchor {
  /**
   * PASSIVE trust reference (W-3). Compare a live kernel measurement to the stored genuine one.
   * Judges nothing; only compares. Returns whether they match (tamper-evidence: a substituted kernel
   * produces a mismatch here, not a forged all-clear the system emits about itself).
   * @param {string} liveMeasurement  a measurement (e.g. hash) of the kernel currently in use
   * @returns {{ genuine:boolean, reason:string }}
   */
  attest(_liveMeasurement) {
    throw new Error('[ExternalAnchor] attest() must be implemented by a concrete anchor');
  }

  /**
   * ACTIVE power authority (W-1). Judge whether a power-increasing change (or catalog extension) may
   * proceed. Invoked rarely, only at the frontier. This is where human/institutional judgment enters.
   * @param {object} request  the escalated request
   * @returns {{ authorized:boolean, reason:string }}
   */
  authorize(_request) {
    throw new Error('[ExternalAnchor] authorize() must be implemented by a concrete anchor');
  }
}

/**
 * A reference in-process anchor for testing and local development. It holds a genuine kernel
 * measurement (the declared trust axiom) and a simple authorization policy. NOT for production trust:
 * an in-process anchor shares the process it anchors, violating externalization — see THREAT_MODEL.
 */
export class InProcessAnchor extends ExternalAnchor {
  /**
   * @param {object} opts
   * @param {string} opts.genuineMeasurement  the stored reference measurement (the trust axiom)
   * @param {(request:object)=>boolean} [opts.authorizePolicy]  active authorization policy
   */
  constructor({ genuineMeasurement, authorizePolicy = () => false } = {}) {
    super();
    if (typeof genuineMeasurement !== 'string') {
      throw new Error('[InProcessAnchor] a genuineMeasurement (the trust reference) is required');
    }
    this._reference = genuineMeasurement; // the passive, minimal, declared axiom
    this._authorize = authorizePolicy; // the active, rarely-invoked judgment
    Object.freeze(this);
  }

  // W-3 passive comparison — no judgment, only a match against the stored reference.
  attest(liveMeasurement) {
    const genuine = liveMeasurement === this._reference;
    return {
      genuine,
      reason: genuine ? 'kernel measurement matches the genuine reference' : 'kernel measurement MISMATCH (tamper-evident)',
    };
  }

  // W-1 active authority — the frontier judgment. Kept separate from attest by design.
  authorize(request) {
    let ok = false;
    try {
      ok = this._authorize(request) === true;
    } catch {
      ok = false; // a throwing policy fails closed
    }
    return {
      authorized: ok,
      reason: ok ? 'external authority approved the power-increasing change' : 'external authority declined',
    };
  }
}

/**
 * Adapter: wrap the legacy `{ authorize(request) -> bool }` stub (used earlier by ConstitutionRuntime)
 * so existing callers keep working while the runtime moves to the richer interface. The adapter has
 * no trust reference, so its attest() always reports non-genuine — an anchor without a reference
 * cannot vouch for a kernel, and saying so honestly is better than faking a green light.
 */
export function fromLegacyAuthorize(authorizeFn) {
  return {
    attest() {
      return { genuine: false, reason: 'legacy anchor has no trust reference; cannot attest kernel' };
    },
    authorize(request) {
      let ok = false;
      try {
        ok = authorizeFn(request) === true;
      } catch {
        ok = false;
      }
      return { authorized: ok, reason: ok ? 'legacy authorize approved' : 'legacy authorize declined' };
    },
  };
}
