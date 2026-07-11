// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang).
// Dual-licensed: GNU AGPL-3.0-or-later (see /LICENSE) OR a commercial license
// (see /COMMERCIAL-LICENSE.md). The PAD formulae, coordinate values, and algorithms
// herein are original works of the author (see the CogMesh Technical Whitepaper).
// This program is free software: redistribute/modify under the AGPL; it comes with
// NO WARRANTY. If you run a modified version over a network, the AGPL requires you to
// offer its complete source to users.

// src/core/orchestration/boundedRationality.js
// CogMesh Sprint 19 — Bounded Rationality (resource-limited optimization)
//
// Design (spec 4.3, the paper-grade leap point):
//   π* = arg max_π  E[R] - β·Cost(π)
//   Cost = B · H · C_world
//   → intelligence = performance − compute cost
//
// Core philosophy: thinking more is not automatically smarter.
//   True intelligence is allocating the compute budget (branching B, search depth H) to problem difficulty.
//   Digging deep on an easy question is inefficient; going shallow on a hard one is flimsy.
//
// This is cognition (not learning): each request decides in real time how much resource this problem needs.
//
// Fully functional in the web app:
//   - B, H are real parameters usable downstream (engine execution depth, LLM tokens, etc.).
//   - C_world actually reflects the current World Model size (object/relation counts).

import { worldModel } from '../instances.js';

// Budget tier definitions: (B=branching, H=search depth, maxTokens=output budget)
export const BUDGET_TIERS = {
  MINIMAL: { B: 1, H: 1, maxTokens: 200,  label: { ko: '최소', en: 'Minimal' } },
  LIGHT:   { B: 2, H: 2, maxTokens: 400,  label: { ko: '경량', en: 'Light'   } },
  STANDARD:{ B: 3, H: 3, maxTokens: 800,  label: { ko: '표준', en: 'Standard'} },
  DEEP:    { B: 5, H: 4, maxTokens: 1500, label: { ko: '심층', en: 'Deep'    } },
};

/**
 * Compute the current World Model world-cost coefficient C_world.
 * The more complex the world (more objects/relations), the higher the per-step cost.
 * @returns {number} C_world (>= 1.0)
 */
export function computeWorldCost() {
  try {
    const snap = worldModel.snapshot();
    const n = snap.objects.length + snap.relations.length;
    // log scale: 1.0 at 0 objects, rising gently as they grow
    return 1 + Math.log2(1 + n) * 0.1;
  } catch {
    return 1.0;
  }
}

/**
 * Compute a tier total compute cost Cost = B · H · C_world.
 * @param {{B:number,H:number}} tier
 * @param {number} cWorld
 */
export function computeCost(tier, cWorld) {
  return tier.B * tier.H * cWorld;
}

/**
 * Allocate the compute budget suited to the problem (the core Bounded Rationality decision).
 *
 * @param {{
 *   confidence?: number,     // primary engine confidence (high → can go shallow)
 *   uncertainty?: number,    // self-correction uncertainty (high → be more careful)
 *   inputLength?: number,    // input length (longer → likelier complex)
 *   exploration?: number,    // metacognitive exploration (high → look wider)
 * }} signals
 * @param {{ lang?: 'ko'|'en' }} [opts]
 * @returns {{
 *   tier: string,            // name of the allocated tier
 *   budget: object,          // { B, H, maxTokens, label }
 *   cWorld: number,
 *   cost: number,            // B·H·C_world
 *   rationale: string,       // why this budget (cognition self-explanation)
 * }}
 */
export function allocateBudget(signals = {}, opts = {}) {
  const lang = opts.lang || 'en';
  const {
    confidence = 0,
    uncertainty = 0,
    inputLength = 0,
    exploration = 0,
  } = signals;

  // compute a complexity score (0~1): combine several signals
  //  - lower confidence → more complex (dig deeper)
  //  - higher uncertainty → more complex
  //  - longer input → more complex
  //  - higher exploration → look wider
  const lengthScore = Math.min(1, inputLength / 120); // maxes out at 120+ chars
  const complexity = clamp01(
    (1 - confidence) * 0.35 +
    uncertainty * 0.30 +
    lengthScore * 0.20 +
    exploration * 0.15
  );

  // complexity → budget tier (stepwise)
  let tierName;
  if (complexity < 0.25) tierName = 'MINIMAL';
  else if (complexity < 0.5) tierName = 'LIGHT';
  else if (complexity < 0.75) tierName = 'STANDARD';
  else tierName = 'DEEP';

  const budget = BUDGET_TIERS[tierName];
  const cWorld = computeWorldCost();
  const cost = computeCost(budget, cWorld);

  const rationale = explainBudget(tierName, complexity, lang);

  return { tier: tierName, budget, cWorld, cost, complexity, rationale };
}

function explainBudget(tierName, complexity, lang) {
  const pct = Math.round(complexity * 100);
  const tierLabel = BUDGET_TIERS[tierName].label[lang];
  if (lang === 'en') {
    return `Complexity ${pct}% → ${tierLabel} budget. Spending compute proportional to difficulty.`;
  }
  return `복잡도 ${pct}% → ${tierLabel} 예산 배정. 난이도에 비례해 계산 자원을 씁니다.`;
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));
