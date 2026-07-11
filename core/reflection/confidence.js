// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/reflection/confidence.js — a calibrated confidence estimate for a response.
//
// The mesh already produces plenty of confidence-relevant signals: engine confidences,
// how close the top contenders are, the metacognitive caution level, and the
// self-correction uncertainty score. This module *aggregates* them into a single,
// human-readable confidence: a 0~1 number, a band (low/medium/high), and a short
// explanation of what drove it.
//
//   import { estimateConfidence } from './confidence.js';
//   estimateConfidence(routed);
//   // → { score: 0.82, percent: 82, band: 'high', reasons: [...], signals: {...} }
//
// "Confidence" here is the complement of the mesh's uncertainty, adjusted for a few
// extra signals (whether execution was held, how strong the winning engine was). It's
// an estimate, not a guarantee — it reflects how sure the *routing* is, not ground truth.

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/**
 * @param {object} routed - a MeshRouter.route() result
 * @param {{ lang?: 'ko'|'en' }} [opts]
 * @returns {{ score:number, percent:number, band:'low'|'medium'|'high',
 *             reasons:string[], signals:object }}
 */
export function estimateConfidence(routed = {}, opts = {}) {
  const lang = opts.lang || 'en';
  const candidates = Array.isArray(routed.candidates) ? routed.candidates : [];
  const handlers = candidates.filter((c) => c.canHandle);

  // ── signal 1: the winning engine's own confidence ──────────────────────
  const topConfidence = handlers.length ? handlers[0].confidence : 0;

  // ── signal 2: margin over the runner-up (a clear winner = more confidence)
  // no handlers → no basis for confidence (margin 0); exactly one → uncontested (margin 1)
  let margin = 0;
  if (handlers.length === 1) {
    margin = 1;
  } else if (handlers.length >= 2) {
    margin = clamp01(Math.abs(handlers[0].confidence - handlers[1].confidence) / 0.3);
  }

  // ── signal 3: the self-correction uncertainty, if present (its complement) ─
  // correction.uncertainty is 0~1; lower uncertainty → higher confidence
  const uncertainty = typeof routed.correction?.uncertainty === 'number'
    ? routed.correction.uncertainty
    : null;
  const certaintyFromUncertainty = uncertainty === null ? null : 1 - uncertainty;

  // ── combine ────────────────────────────────────────────────────────────
  // base blend: mostly the winner's confidence, boosted by a clear margin
  let score = topConfidence * 0.6 + margin * 0.4;
  // if we have a self-correction reading, average it in (it already fuses caution etc.)
  if (certaintyFromUncertainty !== null) {
    score = score * 0.6 + certaintyFromUncertainty * 0.4;
  }
  // if execution was held (self-braking fired), confidence is inherently low
  if (routed.held) score = Math.min(score, 0.35);

  score = clamp01(score);
  const percent = Math.round(score * 100);
  const band = score >= 0.7 ? 'high' : score >= 0.4 ? 'medium' : 'low';

  // ── human-readable reasons ─────────────────────────────────────────────
  const reasons = [];
  const T = lang === 'ko' ? KO : EN;
  if (routed.held) reasons.push(T.held);
  if (topConfidence >= 0.8) reasons.push(T.strongWinner);
  else if (topConfidence <= 0.4) reasons.push(T.weakWinner);
  if (handlers.length >= 2 && margin <= 0.3) reasons.push(T.contested);
  if (uncertainty !== null && uncertainty >= 0.6) reasons.push(T.highUncertainty);
  if (reasons.length === 0) reasons.push(T.nominal);

  return {
    score,
    percent,
    band,
    reasons,
    signals: { topConfidence, margin, uncertainty, handlers: handlers.length },
  };
}

const EN = {
  held: 'execution was held for self-review',
  strongWinner: 'the selected engine was highly confident',
  weakWinner: 'no engine was strongly confident',
  contested: 'the top engines were closely contested',
  highUncertainty: 'self-correction flagged high uncertainty',
  nominal: 'signals were within a normal range',
};

const KO = {
  held: '자기검토를 위해 실행이 보류됨',
  strongWinner: '선택된 엔진의 확신이 높았음',
  weakWinner: '확신이 강한 엔진이 없었음',
  contested: '상위 엔진들이 근소하게 경합함',
  highUncertainty: '자기교정이 높은 불확실성을 감지함',
  nominal: '신호들이 정상 범위였음',
};
