// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/constitution/PartitionFlow.js — cross-partition information-flow control from
// CONSTITUTION-PARTITION.md §4/§5 and CONSTITUTION-CONVERGENCE.md.
//
// The design finding this implements (and must NOT overclaim): cross-partition information flow — a
// FROZEN (trusted, autonomous) region consuming output from a FLUID (self-modifying, anchored)
// region — is a residual threat that CANNOT be eliminated, only BOUND. The review proved there is no
// treatment that is both free and safe. The only two sound treatments are:
//
//   (a) FORBID the flow      — the frozen region does not consume fluid output (cost: isolation,
//                              the frozen region can't benefit from what the fluid region learns).
//   (b) ANCHOR the flow      — each fluid→frozen value must clear the external anchor before the
//                              frozen region may trust it (cost: autonomy at the interface).
//
// This module enforces exactly those two, and refuses to invent a third "free and safe" path — that
// refusal is the point. A flow that is neither forbidden nor anchored is rejected (fail-closed).
//
// Freezing a consumer's CODE does not isolate it if information flows in; so this governs the FLOW,
// not the code. That distinction is the core of the -PARTITION finding.

export const FLOW_POLICY = Object.freeze({
  FORBID: 'forbid', // frozen region may not consume fluid output at all
  ANCHOR: 'anchor', // fluid output must be anchor-approved before the frozen region trusts it
});

export class PartitionFlowController {
  /**
   * @param {object} opts
   * @param {Object<string,'FROZEN'|'FLUID'>} opts.partitionTags  region → tag
   * @param {Object<string,'forbid'|'anchor'>} [opts.flowPolicies] "fromRegion→toRegion" → policy.
   *        Declares, per directed region pair, how a fluid→frozen flow is treated. A pair with no
   *        declared policy defaults to FORBID (the safe default: unknown flows are refused).
   */
  constructor({ partitionTags = {}, flowPolicies = {} } = {}) {
    this._tags = { ...partitionTags };
    this._policies = { ...flowPolicies };
    Object.freeze(this._tags);
    Object.freeze(this._policies);
  }

  tagOf(region) {
    return this._tags[region] || null;
  }

  /**
   * Evaluate a proposed information flow from `fromRegion` to `toRegion`.
   * @param {object} flow
   * @param {string} flow.fromRegion  producer region
   * @param {string} flow.toRegion    consumer region
   * @param {boolean} [flow.anchorApproved]  set true if the external anchor has approved this value
   * @returns {{ allow:boolean, policy:string|null, reason:string }}
   */
  evaluate({ fromRegion, toRegion, anchorApproved = false }) {
    const fromTag = this.tagOf(fromRegion);
    const toTag = this.tagOf(toRegion);

    // Only fluid→frozen flows are the dangerous case the review identified. Everything else is fine:
    //  - frozen→frozen : both trusted
    //  - frozen→fluid  : fluid is already anchored, trusting a frozen input only tightens it
    //  - fluid→fluid   : the consumer is already anchored anyway
    if (!(fromTag === 'FLUID' && toTag === 'FROZEN')) {
      return { allow: true, policy: null, reason: 'not a fluid→frozen flow; no cross-partition risk' };
    }

    // Dangerous case: a fluid, self-modifying region feeding a frozen, trusted one.
    const key = `${fromRegion}->${toRegion}`;
    const policy = this._policies[key] || FLOW_POLICY.FORBID; // safe default

    if (policy === FLOW_POLICY.FORBID) {
      return {
        allow: false,
        policy,
        reason: `fluid→frozen flow ${key} is FORBIDDEN (isolation): frozen region must not consume it`,
      };
    }

    if (policy === FLOW_POLICY.ANCHOR) {
      if (anchorApproved) {
        return { allow: true, policy, reason: `fluid→frozen flow ${key} ANCHOR-approved` };
      }
      return {
        allow: false,
        policy,
        reason: `fluid→frozen flow ${key} requires external-anchor approval before the frozen region trusts it`,
      };
    }

    // any undeclared/invalid policy is refused — no third "free and safe" path exists
    return { allow: false, policy, reason: `unknown flow policy for ${key}; refused (fail-closed)` };
  }
}
