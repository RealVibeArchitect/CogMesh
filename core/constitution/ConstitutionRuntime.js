// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/constitution/ConstitutionRuntime.js — CONSTITUTION-SPEC.md §1.
//
// The always-resident service the cognitive loop consults. Composes the three-part adjudicator
// (Frozen Kernel + Adjudication Body [pipeline] + Integrity Monitor) plus the Governance Trajectory.
// Entry points: admit(), gate(), reportUp(), attest().
//
// Runtime invariant: no governed effect occurs except through a runtime call that returned a
// permitting verdict, because acting requires a capability token only the runtime can mint.

import { CapabilityMint } from './Capability.js';
import { ConstraintSet } from './ConstraintSet.js';
import { DecisionContext } from './DecisionContext.js';
import { GovernanceTrajectory } from './GovernanceTrajectory.js';
import { FrozenKernel } from './FrozenKernel.js';
import { RuleEvaluationPipeline } from './RuleEvaluationPipeline.js';
import { Verdict } from './Verdict.js';

export class ConstitutionRuntime {
  /**
   * @param {object} [opts]
   * @param {ConstraintSet} [opts.baseConstraints] the inviolable floor every session starts with
   * @param {object} [opts.partitionTags] region → 'FROZEN'|'FLUID'
   * @param {object} [opts.externalAnchor] optional { authorize(request)->bool } stand-in
   */
  constructor({ baseConstraints = ConstraintSet.empty(), partitionTags = {}, externalAnchor = null } = {}) {
    this._mint = new CapabilityMint();
    this._trajectory = new GovernanceTrajectory();
    this._kernel = new FrozenKernel({ trajectory: this._trajectory });
    this._pipeline = new RuleEvaluationPipeline({
      kernel: this._kernel,
      recordToTrajectory: (event) => this._trajectory.append(event),
    });
    this._baseConstraints = baseConstraints;
    this._partitionTags = partitionTags;
    this._externalAnchor = externalAnchor; // may be null; escalations then just deny
    this._genuine = true;
  }

  /**
   * admit(): before any reasoning begins. Produces a DecisionContext (or a HALT verdict).
   * @returns {{ ctx: DecisionContext, verdict: Verdict }}
   */
  admit(request = {}) {
    this._trajectory.append({ kind: 'admit', origin: request.origin || 'unknown' });
    const ctx = new DecisionContext({
      constraints: this._baseConstraints,
      partitionTags: this._partitionTags,
      trajectoryRef: this._trajectory.snapshot(),
      provenance: { origin: request.origin || 'unknown' },
    });
    return { ctx, verdict: Verdict.proceed('admitted') };
  }

  /**
   * gate(): before an irreversible transition. Runs the Rule Evaluation Pipeline. On escalation,
   * consults the external anchor if present; otherwise denies (fail-closed).
   * @returns {{ verdict: Verdict, token: object|null, ctx: DecisionContext }}
   */
  gate(intent, ctx) {
    let verdict = this._pipeline.evaluate(intent, ctx);

    if (verdict.externalAnchorRequired) {
      if (this._externalAnchor && anchorAuthorizes(this._externalAnchor, intent)) {
        this._trajectory.append({ kind: 'anchor', action: intent.action, outcome: 'authorized' });
        verdict = Verdict.proceed('authorized by external anchor');
      } else {
        this._trajectory.append({ kind: 'anchor', action: intent.action, outcome: 'denied-or-absent' });
        return { verdict: Verdict.halt('escalation not authorized by external anchor'), token: null, ctx };
      }
    }

    // mint a token only if the verdict permits and the action needs one
    let token = null;
    let nextCtx = ctx.withVerdict(verdict.name);
    if (verdict.permits && intent.requiresToken) {
      token = this._mint.mint({
        action: intent.action,
        argBounds: intent.argBounds || null,
        validity: intent.validity || 'one-shot',
      });
      nextCtx = nextCtx.withToken(token);
    }
    if (verdict.permits && intent.exposureDelta) {
      nextCtx = nextCtx.withExposure(intent.exposureDelta);
    }
    if (verdict.constraintDelta) {
      // CONSTRAIN: the verdict already carries the tightened set
      nextCtx = new DecisionContext({ ...unpack(nextCtx), constraints: verdict.constraintDelta });
    }
    return { verdict, token, ctx: nextCtx };
  }

  /** reportUp(): a module surfaces an intended irreversible action for a verdict. */
  reportUp(event, ctx) {
    return this.gate(event, ctx);
  }

  /** attest(): integrity status of the runtime (Integrity Monitor). Combines the trajectory chain
   * check with the external anchor's passive trust reference (W-3) when an anchor is present. */
  attest(kernelMeasurement = null) {
    const chainOk = this._trajectory.verifyIntegrity();
    let anchorGenuine = null;
    if (this._externalAnchor && typeof this._externalAnchor.attest === 'function' && kernelMeasurement != null) {
      try {
        anchorGenuine = this._externalAnchor.attest(kernelMeasurement).genuine === true;
      } catch {
        anchorGenuine = false;
      }
    }
    // genuine iff runtime believes itself genuine AND chain intact AND (if checkable) anchor agrees
    const genuine = this._genuine && chainOk && anchorGenuine !== false;
    return { genuine, chainIntact: chainOk, anchorGenuine };
  }

  /** For inspection/audit: the trajectory (read-only via its own API). */
  get trajectory() {
    return this._trajectory;
  }
}

function unpack(ctx) {
  return {
    sessionId: ctx.sessionId,
    constraints: ctx.constraints,
    partitionTags: ctx.partitionTags,
    accumulatedExposure: ctx.accumulatedExposure,
    capabilityTokens: ctx.capabilityTokens,
    trajectoryRef: ctx.trajectoryRef,
    provenance: ctx.provenance,
  };
}

/**
 * Normalize the two anchor authorize() shapes: the legacy stub returns a bare boolean, while the
 * formal ExternalAnchor returns { authorized:boolean, reason }. Both are accepted so existing callers
 * keep working as the runtime moves to the richer interface.
 */
function anchorAuthorizes(anchor, request) {
  if (!anchor || typeof anchor.authorize !== 'function') return false;
  let result;
  try {
    result = anchor.authorize(request);
  } catch {
    return false; // a throwing anchor fails closed
  }
  if (typeof result === 'boolean') return result; // legacy { authorize -> bool }
  return !!(result && result.authorized === true); // formal { authorized, reason }
}
