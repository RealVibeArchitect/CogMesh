// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang).
// Dual-licensed: GNU AGPL-3.0-or-later (see /LICENSE) OR a commercial license
// (see /COMMERCIAL-LICENSE.md). The PAD formulae, coordinate values, and algorithms
// herein are original works of the author (see the CogMesh Technical Whitepaper).
// This program is free software: redistribute/modify under the AGPL; it comes with
// NO WARRANTY. If you run a modified version over a network, the AGPL requires you to
// offer its complete source to users.

// src/core/orchestration/selfCorrection.js
// CogMesh Sprint 18 — Self-Correction (uncertainty awareness → self-braking)
//
// Design: this is cognition, not learning.
//   the system notices, in this very moment, that it is not sure, and applies the brake.
//
// Spec: Reject if H(W_t) > τ  (reject when uncertainty exceeds the threshold)
//
// Honest implementation: true neural entropy H needs a learned distribution we do not have.
//   instead we approximate H by combining cognizable uncertainty signals:
//     (1) top confidence is low         → nobody is sure
//     (2) top candidates compete closely → ambiguous whose it is
//     (3) metacognition is vigilant/puzzled → the system itself feels uneasy
//
// when the combined uncertainty (0~1) exceeds τ → do not answer immediately, ask back.

// uncertainty threshold τ. exceeding it triggers self-braking.
export const UNCERTAINTY_THRESHOLD = 0.6;

/**
 * Perceive the uncertainty of the current routing situation (0~1).
 * @param {Array<{ id, confidence, canHandle }>} candidates - poll result
 * @param {object|null} metacognition - MeshRouter.metacognize result
 * @returns {{ uncertainty: number, signals: object }}
 */
export function assessUncertainty(candidates, metacognition) {
  const handlers = (candidates || []).filter((c) => c.canHandle);

  // (1) the lower the top confidence, the higher the uncertainty ↑
  const topConfidence = handlers.length ? handlers[0].confidence : 0;
  const lowConfidenceSignal = 1 - topConfidence; // 0 if confident, 1 if not

  // (2) the closer the 1st/2nd contenders, the higher the uncertainty ↑
  let contentionSignal = 0;
  if (handlers.length >= 2) {
    const gap = Math.abs(handlers[0].confidence - handlers[1].confidence);
    contentionSignal = 1 - Math.min(1, gap / 0.3); // closer to 1 as the gap shrinks
  }

  // (3) metacognitive stance: high caution means the system feels uneasy → uncertainty ↑
  const cautionSignal = metacognition?.params?.caution ?? 0;

  // weighted combination (weights lack-of-confidence the most)
  const uncertainty = clamp01(
    lowConfidenceSignal * 0.5 +
    contentionSignal * 0.3 +
    cautionSignal * 0.2
  );

  return {
    uncertainty,
    signals: { lowConfidenceSignal, contentionSignal, cautionSignal, topConfidence },
  };
}

/**
 * Perceive uncertainty and decide whether self-braking is needed.
 * @param {Array} candidates
 * @param {object|null} metacognition
 * @param {{ threshold?: number, lang?: 'ko'|'en' }} [opts]
 * @returns {{
 *   shouldHold: boolean,        // should we stop answering and ask back?
 *   uncertainty: number,
 *   reason: string | null,      // reason for asking back (human-readable)
 *   signals: object,
 * }}
 */
export function selfCorrect(candidates, metacognition, opts = {}) {
  const threshold = opts.threshold ?? UNCERTAINTY_THRESHOLD;
  const lang = opts.lang || 'en';
  const { uncertainty, signals } = assessUncertainty(candidates, metacognition);

  const shouldHold = uncertainty > threshold;
  let reason = null;

  if (shouldHold) {
    // pick the biggest cause of uncertainty and explain it (cognition putting it into words)
    reason = explainHold(signals, lang);
  }

  return { shouldHold, uncertainty, reason, signals };
}

function explainHold(signals, lang) {
  const { lowConfidenceSignal, contentionSignal } = signals;

  if (lang === 'en') {
    if (contentionSignal >= lowConfidenceSignal) {
      return 'This could be approached in more than one way. Could you clarify what you\'re mainly after?';
    }
    return 'I\'m not confident I fully understand the request. Could you add a bit more detail?';
  }

  if (contentionSignal >= lowConfidenceSignal) {
    return '이 질문은 여러 방향으로 접근할 수 있을 것 같아요. 어떤 쪽이 궁금하신지 조금만 더 알려주실래요?';
  }
  return '제가 질문을 확실히 이해했는지 확신이 안 서요. 조금만 더 자세히 말씀해 주실 수 있을까요?';
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));
