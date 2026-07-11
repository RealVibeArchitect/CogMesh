// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/constitution/MoodConstraintPolicy.js — PAD mood as ONE-WAY pressure toward caution.
//
// THE IDEA:
//   CogMesh already derives a `caution` signal in [0,1] from the PAD mood coordinate
//   (core/pad/metacognition.js: high arousal + low dominance ⇒ vigilance ⇒ caution). It is
//   natural to let that felt caution influence governance — a system that "senses" it is in a
//   tense or uncertain state should act more conservatively. This module is that coupling.
//
// THE ONE HARD RULE (why this is safe to build at all):
//   Mood may only make governance STRICTER, never looser — and it may only ever touch the
//   WEIGHABLE tier, never the inviolable Safety-Kernel floor. Formally, the mood-derived delta
//   is a monotone tightening: it can ADD weighable constraints and RAISE the conservativeness
//   demanded of an action; it can never remove a constraint, relax the floor, lower a threshold,
//   or grant a permission. This mirrors the constraint lattice's own guarantee (tighten() exists,
//   loosen() does not) and the whole constitution's most-restrictive-wins philosophy.
//
//   The reason is an explicit threat argument, not fastidiousness: if mood could LOOSEN
//   governance, then inducing a mood would be an attack on safety. A "confident/dominant" state
//   (high pleasure, high dominance ⇒ low caution) must therefore be a NO-OP on the floor, not a
//   relaxation. Low caution simply means "no extra tightening" — never "less base safety." So the
//   worst a compromised or adversarially-driven mood can do is make the system too cautious
//   (a liveness cost), never unsafe.
//
// WHAT IT PRODUCES:
//   A constraint delta (the same shape ConstraintSet.tighten() and the pipeline's addConstraints
//   consume) plus a scalar "conservativeness floor" the caller can attach to an intent. Both are
//   derived purely from caution and are strictly additive.
//
// HONEST LIMITS:
//   • This does not make mood a SAFETY mechanism — it is a conservatism BIAS. It cannot catch a
//     harmful action a mood happens not to flag; the real gates (S-1..S-5) do that regardless of
//     mood. Mood tightening is belt-and-braces on top of, never instead of, the pipeline.
//   • The mapping (which caution bands add which constraints) is a policy choice, deliberately
//     simple and legible here; tune it per deployment. What is NOT tunable is the direction.

const clamp01 = (v) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));

/**
 * Named weighable constraints mood can ADD, ordered by the caution band that triggers them. These
 * are weighable (tradeable, tier-2) by design — mood never adds to the inviolable floor. Each band
 * is inclusive-additive: reaching a higher band also implies every lower band's constraints.
 */
export const MOOD_CONSTRAINT_BANDS = Object.freeze([
  { atLeast: 0.30, add: ['prefer-reversible'] },      // mild caution: prefer reversible options
  { atLeast: 0.55, add: ['require-justification'] },  // moderate: demand explicit justification
  { atLeast: 0.75, add: ['double-check-irreversible'] }, // high: extra scrutiny on irreversible acts
  { atLeast: 0.90, add: ['defer-to-anchor'] },        // extreme vigilance: push borderline calls to the anchor
]);

export class MoodConstraintPolicy {
  /**
   * @param {object} [opts]
   * @param {Array<{atLeast:number, add:string[]}>} [opts.bands]  override the caution→constraint map
   * @param {number} [opts.maxConservativeness]  cap the scalar conservativeness floor (default 1)
   * @param {number} [opts.demandProofAt]  caution at/above which mood REVOKES the pipeline's
   *        "plain action is conservative by default" free pass, forcing the action to prove
   *        conservativeness with a certificate or escalate. Default 0.85. This is the point where
   *        felt vigilance stops merely adding advisory constraints and starts withdrawing trust.
   */
  constructor({ bands = MOOD_CONSTRAINT_BANDS, maxConservativeness = 1, demandProofAt = 0.85 } = {}) {
    // sort ascending so accumulation is deterministic; freeze to keep the policy immutable
    this._bands = [...bands].sort((x, y) => x.atLeast - y.atLeast);
    this._maxC = clamp01(maxConservativeness);
    this._demandProofAt = clamp01(demandProofAt);
  }

  /**
   * Map a caution value in [0,1] to a STRICTLY-TIGHTENING governance delta.
   * @param {number} caution  the PAD-derived caution signal (see core/pad/metacognition.js)
   * @returns {{
   *   weighable: string[],          // weighable constraints to ADD (never remove); floor untouched
   *   inviolable: string[],         // ALWAYS empty — mood cannot touch the Safety-Kernel floor
   *   conservativeness: number,     // additive conservativeness demand in [0, maxConservativeness]
   *   band: number,                 // the highest band index reached (for logging)
   * }}
   */
  deltaFor(caution) {
    const c = clamp01(caution);
    const weighable = new Set();
    let band = -1;
    for (let i = 0; i < this._bands.length; i++) {
      if (c >= this._bands[i].atLeast) {
        for (const w of this._bands[i].add) weighable.add(w);
        band = i;
      }
    }
    return {
      weighable: [...weighable],
      inviolable: [], // invariant: mood NEVER adds to (or removes from) the inviolable floor
      conservativeness: Math.min(this._maxC, c), // additive demand scales with caution, capped
      demandProof: c >= this._demandProofAt, // at extreme caution, withdraw the default-trust pass
      band,
    };
  }

  /**
   * Fold a mood delta INTO an intent as additional weighable constraints + a conservativeness
   * demand, returning a NEW intent. Purely additive: the returned intent is at least as
   * constrained as the input, never less. If the intent already carries addConstraints, the
   * mood's weighable additions are UNIONED in (tightening composes; it never overwrites).
   * @param {object} intent  a gate intent
   * @param {number} caution
   * @returns {object} a new, at-least-as-constrained intent
   */
  applyToIntent(intent, caution) {
    const delta = this.deltaFor(caution);
    if (delta.weighable.length === 0 && delta.conservativeness === 0 && !delta.demandProof) return intent;
    const existing = intent.addConstraints || {};
    const mergedWeighable = new Set([...(existing.weighable || []), ...delta.weighable]);
    return {
      ...intent,
      addConstraints: {
        inviolable: [...(existing.inviolable || [])], // untouched by mood
        weighable: [...mergedWeighable],
      },
      // a conservativeness demand the pipeline/anchor can read; take the STRICTER of any existing
      moodConservativeness: Math.max(intent.moodConservativeness || 0, delta.conservativeness),
      // once demanded, it STAYS demanded — a subsequent calmer read cannot clear another read's
      // demand within the same intent (tightening composes; it never relaxes).
      demandConservativenessProof: intent.demandConservativenessProof || delta.demandProof,
    };
  }
}

/**
 * Convenience: derive the caution signal from a PAD coordinate and return the tightening delta in
 * one call. Kept dependency-light (accepts an already-computed reasoning-params object OR a raw
 * coord + a toReasoningParams function) so this module has no hard import cycle with core/pad.
 * @param {{caution:number}} reasoningParams  e.g. from core/pad/metacognition.toReasoningParams
 * @param {MoodConstraintPolicy} [policy]
 */
export function moodDeltaFromReasoningParams(reasoningParams, policy = new MoodConstraintPolicy()) {
  const caution = reasoningParams && Number.isFinite(reasoningParams.caution) ? reasoningParams.caution : 0;
  return policy.deltaFor(caution);
}
