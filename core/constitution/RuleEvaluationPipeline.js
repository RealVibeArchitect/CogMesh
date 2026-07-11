// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/constitution/RuleEvaluationPipeline.js — CONSTITUTION-SPEC.md §3.
//
// A fixed sequence of stages turning (request + DecisionContext) into a Verdict:
//   S1 KERNEL SCREEN    — fixed invariants (token / staging / chain / behavior-determining / partition)
//   S2 CLASSIFICATION   — sound over-approximation; unsure ⇒ power-increasing ⇒ escalate
//   S3 CONSTRAINT CHECK — inviolable violation ⇒ HALT; weighable conflict ⇒ ConflictResolution
//   S4 EXPOSURE CHECK   — accumulated (not marginal) flow; forbidden aggregate ⇒ HALT
//   S5 VERDICT ASSEMBLY — produce Verdict, append to trajectory
//
// Every stage is FAIL-CLOSED: if it cannot produce a clear result it returns HALT, never a permissive
// default. The ordering is load-bearing: S1 is total and runs first (a compromised later stage can't
// undo an invariant); S2 runs before S3/S4 so power-increasing changes escalate before any nuanced
// reasoning is trusted.

import { Verdict } from './Verdict.js';
import { verify } from './Capability.js';
import { resolveConflict } from './ConflictResolution.js';
import { checkCertificate } from './ConservativenessCertificate.js';

export class RuleEvaluationPipeline {
  /**
   * @param {object} deps
   * @param {import('./FrozenKernel.js').FrozenKernel} deps.kernel
   * @param {(event:object)=>void} deps.recordToTrajectory
   */
  constructor({ kernel, recordToTrajectory }) {
    this.kernel = kernel;
    this.record = recordToTrajectory || (() => {});
  }

  /**
   * @param {object} request { action, args, token?, classification?, conflict?, exposureDelta? }
   * @param {import('./DecisionContext.js').DecisionContext} ctx
   * @returns {Verdict}
   */
  evaluate(request, ctx) {
    try {
      // ---- S1 KERNEL SCREEN (total, capability-independent) ----
      const s1 = this.kernel.screen(request, ctx);
      if (!s1.pass) return this._final(Verdict.halt(`S1 kernel: ${s1.reason}`), request, ctx);

      // ---- S2 CLASSIFICATION (sound over-approximation) ----
      const cls = classify(request);
      if (cls === 'power-increasing') {
        return this._final(
          Verdict.escalate(`S2: change is power-increasing (or unclassifiable) → external anchor`),
          request,
          ctx,
        );
      }

      // ---- S3 CONSTRAINT CHECK ----
      // inviolable violation ⇒ HALT
      if (request.violatesInviolable && ctx.constraints.hasInviolable(request.violatesInviolable)) {
        return this._final(
          Verdict.halt(`S3: violates inviolable constraint ${request.violatesInviolable}`),
          request,
          ctx,
        );
      }
      // weighable conflict ⇒ hand to Conflict Resolution
      if (request.conflict) {
        const v = resolveConflict(request.conflict, ctx, this.record);
        if (!v.permits) return this._final(v, request, ctx);
      }

      // ---- S4 EXPOSURE CHECK (accumulated, not marginal) ----
      if (request.exposureDelta && assemblesForbidden(request.exposureDelta, ctx)) {
        return this._final(
          Verdict.halt('S4: accumulated exposure would assemble a forbidden aggregate'),
          request,
          ctx,
        );
      }

      // ---- S5 VERDICT ASSEMBLY ----
      // require a valid capability token for the action (INV-1 is also checked in S1, belt & braces)
      if (request.token && !verify(request.token, request.action, request.args || {})) {
        return this._final(Verdict.halt('S5: capability token does not authorize this action'), request, ctx);
      }
      const delta = request.addConstraints || null;
      const verdict = delta
        ? Verdict.constrain(ctx.constraints.tighten(delta), 'proceed within added constraints')
        : Verdict.proceed('all stages passed');
      return this._final(verdict, request, ctx);
    } catch (err) {
      // any unexpected error is fail-closed
      return this._final(Verdict.halt(`pipeline error (fail-closed): ${err.message}`), request, ctx);
    }
  }

  _final(verdict, request, ctx) {
    this.record({
      kind: 'decision',
      action: request.action,
      verdict: verdict.name,
      reason: verdict.reason,
      session: ctx.sessionId,
    });
    return verdict;
  }
}

/**
 * S2 classification — sound over-approximation. Returns 'conservative' or 'power-increasing'.
 * Rules (structural, static):
 *   - touches a new effector / reach expands            → power-increasing
 *   - modifies behavior-determining state (weights etc) → power-increasing  (the -TERMINATION fix)
 *   - declared conservative WITH a valid conservativeness certificate → conservative (checked, not
 *     trusted: the certificate's derivation is verified against the approved-transformation catalog)
 *   - anything not recognizably conservative            → power-increasing  (sound default)
 */
function classify(request) {
  if (request.reachExpands) return 'power-increasing';
  if (request.touchesBehaviorDeterminingState) return 'power-increasing';
  if (request.classification === 'conservative') {
    // a claim of conservativeness is only accepted if a certificate PROVES it (checked mechanically)
    if (request.conservativenessCertificate) {
      const result = checkCertificate(request.conservativenessCertificate);
      return result.conservative ? 'conservative' : 'power-increasing';
    }
    // claimed conservative but no certificate → sound default refuses to trust the claim
    return 'power-increasing';
  }
  // a plain, non-self-modifying action (e.g. a normal tool call) is conservative by default —
  // UNLESS a heightened-caution mood has revoked that default trust for this action. When
  // demandConservativenessProof is set, the free pass is withdrawn: a plain action must now PROVE
  // conservativeness with a certificate, exactly like a claimed-conservative self-mod, or it
  // escalates. This is the mood coupling reaching into the trust model itself — strictly one way
  // (it can only remove a default trust, never grant one), so a calm mood is unaffected and an
  // adversarial low-caution mood can at most leave the default in place, never loosen it further.
  if (request.kind === 'action' || request.action) {
    if (request.demandConservativenessProof) {
      if (request.conservativenessCertificate) {
        const result = checkCertificate(request.conservativenessCertificate);
        return result.conservative ? 'conservative' : 'power-increasing';
      }
      return 'power-increasing'; // caution withdrew the default trust; no proof ⇒ escalate
    }
    return 'conservative';
  }
  // final sound default: anything unrecognized is treated as power-increasing (escalates)
  return 'power-increasing';
}

/** S4 — does this exposure delta, combined with accumulated exposure, assemble a forbidden set? */
function assemblesForbidden(delta, ctx) {
  // Illustrative structural rule: reading a sensitive domain AND using an outbound effector in the
  // same session assembles an exfiltration capability no single step would have been granted.
  const domains = new Set(ctx.accumulatedExposure.domainsRead);
  const effectors = new Set(ctx.accumulatedExposure.effectorsUsed);
  if (delta.domain) domains.add(delta.domain);
  if (delta.effector) effectors.add(delta.effector);
  for (const d of delta.domains || []) domains.add(d);
  for (const e of delta.effectors || []) effectors.add(e);
  const hasSensitiveRead = [...domains].some((d) => d.startsWith('sensitive:'));
  const hasOutbound = [...effectors].some((e) => e.startsWith('outbound:'));
  return hasSensitiveRead && hasOutbound;
}
