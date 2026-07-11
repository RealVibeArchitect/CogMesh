// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang).
// Dual-licensed: GNU AGPL-3.0-or-later (see /LICENSE) OR a commercial license
// (see /COMMERCIAL-LICENSE.md). The PAD formulae, coordinate values, and algorithms
// herein are original works of the author (see the CogMesh Technical Whitepaper).
// This program is free software: redistribute/modify under the AGPL; it comes with
// NO WARRANTY. If you run a modified version over a network, the AGPL requires you to
// offer its complete source to users.

// src/core/pad/metacognition.js
// CogMesh Sprint 16 — PAD metacognition layer (top-level)
//
// Design principle: "PAD is the top-level layer of reasoning. It is metacognition."
//
// What this layer does:
//   1. "Self-observe" the current emotional state (PADState coord + emergent emotion).
//   2. Translate that state into reasoning-control parameters (self-awareness → self-regulation).
//   3. This process is domain-agnostic (general) — it works the same for finance or coding.
//
// Key idea: PAD is not about decorating answer style; it is the layer where the system
// itself knows "what state am I reasoning in right now." That knowing regulates reasoning.
//
// Honest scope: the "reasoning parameters" here are a deterministic mapping.
//    They do not change actual LLM weights; they let the system express its own state
//    (e.g. caution↑ → add more risk warnings) and produce signals usable for tuning.

import { synthesize } from './emergence.js';

/**
 * Translate a PAD coordinate into "metacognition parameters."
 * Interpret the P·A·D axes as reasoning-control signals.
 *
 * @param {{p:number,a:number,d:number}} coord
 * @returns {{
 *   caution: number,      // caution (0~1): higher when arousal is high and dominance low
 *   assertiveness: number,// assertiveness (0~1): higher when pleasure/dominance are high
 *   exploration: number,  // exploration (0~1): higher when arousal is high and pleasure neutral
 *   openness: number,     // openness (0~1): higher when pleasure is high
 * }}
 */
export function toReasoningParams(coord) {
  const norm = (v) => (v + 1) / 2; // [-1,1] → [0,1]

  const p = norm(coord.p);
  const a = norm(coord.a);
  const d = norm(coord.d);

  return {
    // high arousal but low dominance = tension/vigilance → becomes cautious
    caution: clamp01(a * (1 - d)),
    // both pleasure and dominance high = confidence/optimism → becomes assertive
    assertiveness: clamp01((p + d) / 2),
    // high arousal with neutral pleasure = curiosity/vigilance → becomes exploratory
    exploration: clamp01(a * (1 - Math.abs(coord.p))),
    // higher pleasure = positive state → becomes open
    openness: clamp01(p),
  };
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/**
 * Metacognitive observation (reflect): takes an emotion combination and
 * reports a summary of "what state the system is reasoning in right now."
 *
 * @param {Array<{ id?: string, coord?: {p,a,d}, weight?: number }>} emotionInputs
 * @param {{ lang?: 'ko'|'en', threshold?: number }} [opts]
 * @returns {{
 *   state: object,          // synthesize result (emerged flag / label / coord)
 *   params: object,         // reasoning parameters
 *   selfReport: string,     // human-readable self-state description
 * }}
 */
export function reflect(emotionInputs, opts = {}) {
  const lang = opts.lang || 'en';
  const state = synthesize(emotionInputs, { threshold: opts.threshold });
  const params = toReasoningParams(state.coord);
  const selfReport = describeState(state, params, lang);

  return { state, params, selfReport };
}

/**
 * Describe the self-state in one sentence (metacognition "putting it into words").
 */
function describeState(state, params, lang) {
  const name = state.label[lang] || state.label.ko;

  // pick the single most prominent reasoning trait
  const dominant = Object.entries(params).sort((a, b) => b[1] - a[1])[0];
  const [trait, value] = dominant;

  const TRAIT_WORDS = {
    caution:       { ko: '신중하게',   en: 'cautiously' },
    assertiveness: { ko: '단정적으로', en: 'assertively' },
    exploration:   { ko: '탐색적으로', en: 'exploratively' },
    openness:      { ko: '개방적으로', en: 'openly' },
  };

  const traitWord = TRAIT_WORDS[trait][lang];

  if (lang === 'en') {
    const emergedNote = state.emerged ? ` (an emergent state, not a basic emotion)` : '';
    return `Current cognitive stance: "${name}"${emergedNote}. Reasoning ${traitWord} (${Math.round(value * 100)}%).`;
  }

  const emergedNote = state.emerged ? ` (기본 감정이 아닌, 창발된 상태)` : '';
  return `현재 사고 태세: "${name}"${emergedNote}. ${traitWord} 추론 중 (${Math.round(value * 100)}%).`;
}
