// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang).
// Dual-licensed: GNU AGPL-3.0-or-later (see /LICENSE) OR a commercial license
// (see /COMMERCIAL-LICENSE.md). The PAD formulae, coordinate values, and algorithms
// herein are original works of the author (see the CogMesh Technical Whitepaper).
// This program is free software: redistribute/modify under the AGPL; it comes with
// NO WARRANTY. If you run a modified version over a network, the AGPL requires you to
// offer its complete source to users.

// src/core/orchestration/meshMood.js
// CogMesh Sprint 17 — bridge that induces PAD emotion from the Mesh situation
//
// Design principle: PAD is the top-level metacognition layer of reasoning.
// But what decides the system current emotional state?
//
// Honest approach: there is no user-tone analyzer yet, so we induce the system
// reasoning stance from the Mesh routing situation itself. This is not forced emotion,
// but a natural expression of how the system is facing this problem right now.
//
// Induction rules (situation → emotion combination):
//   - several engines compete at similar confidence → puzzled + curious (which one? interesting)
//   - one engine has overwhelming confidence → proud/confident (it is clear)
//   - nobody is confident (fallback) → vigilant + puzzled (must look carefully)
//   - a finance risk question leads → vigilant (caution mode)

/**
 * Induce the system reasoning stance (emotion combination) from the poll candidate list.
 * @param {Array<{ id, confidence, canHandle }>} candidates - result of MeshRouter.poll
 * @param {string|null} chosenId - the chosen primary engine
 * @returns {Array<{ id: string, weight: number }>} emotion inputs to feed PAD reflect()
 */
export function deriveMood(candidates, chosenId) {
  const handlers = candidates.filter((c) => c.canHandle);

  // 1) nobody confident → vigilant + puzzled (cautious exploration)
  if (handlers.length === 0) {
    return [
      { id: 'vigilant', weight: 0.6 },
      { id: 'puzzled', weight: 0.4 },
    ];
  }

  const top = handlers[0];
  const second = handlers[1];

  // 2) two or more engines compete at similar confidence → puzzled + curious
  if (second && Math.abs(top.confidence - second.confidence) < 0.15) {
    return [
      { id: 'puzzled', weight: 0.5 },
      { id: 'curious', weight: 0.5 },
    ];
  }

  // 3) overwhelming confidence (0.8+) → proud/confident
  if (top.confidence >= 0.8) {
    return [
      { id: 'proud', weight: 0.7 },
      { id: 'optimistic', weight: 0.3 },
    ];
  }

  // 4) finance leads → vigilant (finance defaults to caution mode)
  if (chosenId === 'finance') {
    return [
      { id: 'vigilant', weight: 0.6 },
      { id: 'curious', weight: 0.4 },
    ];
  }

  // 5) otherwise (coding, etc. at moderate confidence) → curious + confident
  return [
    { id: 'curious', weight: 0.6 },
    { id: 'proud', weight: 0.4 },
  ];
}
