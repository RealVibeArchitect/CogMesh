// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/cognition/evaluators.js — the Evaluation Council's members.
//
// The document lists ten evaluators (Logic, Emotion, Confidence, Planner, Goal, Cost,
// Risk, Memory, World, Reflection). Rather than invent ten new scoring heuristics, most
// of these *adapt existing CogMesh modules* into the council's evaluator interface:
//
//     { id, weight?, evaluate(candidate, ctx) → verdict, review?(target, candidate, ctx) }
//
// A verdict is { score, confidence, reason, strength, weakness, improvement }.
//
// Each evaluator reads the already-simulated node (it has `.score` from the world rollout
// and `.future` = the imagined World snapshot) plus its own lens, so evaluation is cheap:
// no new simulation happens here. Evaluators are deliberately small and swappable.

import { toReasoningParams } from '../pad/index.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);

/**
 * World evaluator — trusts the WorldSimulator's own rollout score. This is the "did the
 * imagined future actually go well" signal, and it anchors the council.
 */
export const worldEvaluator = {
  id: 'world',
  weight: 1.0,
  evaluate(candidate) {
    const score = num(candidate.score);
    return {
      score,
      confidence: candidate.future ? 0.8 : 0.2,
      reason: 'imagined-future world score',
      strength: score > 0 ? 'future improves tracked signals' : '',
      weakness: score <= 0 ? 'future does not improve tracked signals' : '',
    };
  },
};

/**
 * Logic evaluator — rewards internally coherent actions: an action that names concrete
 * effects/fields is more "grounded" than an empty one. Cheap structural proxy for rigor.
 */
export const logicEvaluator = {
  id: 'logic',
  weight: 0.9,
  evaluate(candidate) {
    const a = candidate.action || {};
    const effects = Object.keys(a.effects || {}).length;
    const fields = Object.keys(a.field || {}).length;
    const grounded = effects + fields;
    const base = num(candidate.score);
    const bonus = Math.min(grounded, 4) * 0.05 * Math.max(1, Math.abs(base));
    return {
      score: base + bonus,
      confidence: grounded ? 0.7 : 0.3,
      reason: `structural grounding: ${grounded} concrete term(s)`,
      weakness: grounded === 0 ? 'action specifies no concrete effect' : '',
      improvement: grounded === 0 ? 'attach explicit effects/fields to the action' : '',
    };
  },
};

/**
 * Risk evaluator — penalizes futures that push a 'risk'/'volatility' field high. Reads the
 * imagined future's field snapshot directly.
 */
export function makeRiskEvaluator({ riskFields = ['risk', 'volatility', 'drawdown'], penalty = 30 } = {}) {
  return {
    id: 'risk',
    weight: 0.9,
    evaluate(candidate) {
      const field = candidate.future?.field || {};
      let risk = 0;
      for (const k of riskFields) if (Number.isFinite(field[k])) risk += field[k];
      const score = num(candidate.score) - risk * penalty;
      return {
        score,
        confidence: candidate.future ? 0.75 : 0.25,
        reason: `risk exposure ${risk.toFixed(3)}`,
        weakness: risk > 0.5 ? 'elevated risk in the imagined future' : '',
        improvement: risk > 0.5 ? 'hedge or scale down the risk-bearing action' : '',
      };
    },
  };
}

/**
 * Cost evaluator — penalizes actions that touch many objects/fields (a crude compute/effort
 * proxy). Cheaper plans that reach a similar score are preferred.
 */
export const costEvaluator = {
  id: 'cost',
  weight: 0.6,
  evaluate(candidate) {
    const a = candidate.action || {};
    const cost = Object.keys(a.effects || {}).length + Object.keys(a.field || {}).length;
    const score = num(candidate.score) - cost * 0.5;
    return {
      score,
      confidence: 0.6,
      reason: `action cost ${cost}`,
      improvement: cost > 3 ? 'simplify: fewer moving parts for the same effect' : '',
    };
  },
};

/**
 * Confidence evaluator — folds the candidate's own confidence/agreement signals (if the
 * pipeline attached them) into a mild score adjustment, and reports low confidence loudly.
 */
export const confidenceEvaluator = {
  id: 'confidence',
  weight: 0.7,
  evaluate(candidate) {
    const conf = clamp01(num(candidate.meta?.confidence, 0.5));
    const base = num(candidate.score);
    return {
      score: base * (0.75 + 0.25 * conf),
      confidence: conf,
      reason: `carried confidence ${(conf * 100) | 0}%`,
      weakness: conf < 0.4 ? 'low confidence in this candidate' : '',
    };
  },
  // as a reviewer: endorse peers more when their own confidence is high
  review(target) {
    return { endorsement: clamp01(target.confidence) };
  },
};

/**
 * Emotion (PAD) evaluator — reads the current PAD reasoning params and tilts scoring:
 * a cautious stance discounts high-variance (high |score|) candidates; an exploratory
 * stance rewards novelty (lens ∈ creative set). Wraps toReasoningParams() from core/pad.
 */
export function makePadEvaluator(getCoord) {
  return {
    id: 'emotion',
    weight: 0.7,
    evaluate(candidate) {
      let params = { caution: 0.5, exploration: 0.5 };
      try {
        const coord = typeof getCoord === 'function' ? getCoord() : getCoord;
        if (coord) params = toReasoningParams(coord);
      } catch { /* keep neutral params */ }
      const base = num(candidate.score);
      const novelty = ['creativity', 'creative', 'emotion'].includes(candidate.lens) ? 1 : 0;
      // caution shrinks big bets; exploration boosts novel lenses
      const cautionAdj = 1 - params.caution * 0.3 * clamp01(Math.abs(base) / (Math.abs(base) + 100));
      const exploreAdj = 1 + params.exploration * 0.2 * novelty;
      return {
        score: base * cautionAdj * exploreAdj,
        confidence: 0.6,
        reason: `PAD stance caution=${params.caution.toFixed(2)} explore=${params.exploration.toFixed(2)}`,
        strength: novelty && params.exploration > 0.6 ? 'novel option favored by exploratory mood' : '',
      };
    },
  };
}

/**
 * Goal evaluator — rewards candidates whose lens/label matches the active goal's keywords.
 * @param {() => string} getGoalText  returns the current goal text (or a static string)
 */
export function makeGoalEvaluator(getGoalText) {
  return {
    id: 'goal',
    weight: 0.8,
    evaluate(candidate) {
      let goal = '';
      try { goal = (typeof getGoalText === 'function' ? getGoalText() : getGoalText) || ''; }
      catch { goal = ''; }
      const hay = `${candidate.lens} ${candidate.label || ''}`.toLowerCase();
      const words = goal.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
      const hits = words.filter((w) => hay.includes(w)).length;
      const base = num(candidate.score);
      return {
        score: base + hits * 0.05 * Math.max(1, Math.abs(base)),
        confidence: goal ? 0.7 : 0.3,
        reason: goal ? `goal alignment: ${hits} keyword hit(s)` : 'no active goal',
        strength: hits > 0 ? 'aligns with the active goal' : '',
      };
    },
  };
}

/**
 * Build the default council: the ten-ish evaluators the document names, wired to the live
 * mesh where a module already exists and to lightweight proxies elsewhere.
 * @param {{ getPadCoord?: Function, getGoalText?: Function }} [wiring]
 */
export function buildDefaultCouncil(wiring = {}) {
  return [
    worldEvaluator,
    logicEvaluator,
    makeRiskEvaluator(),
    costEvaluator,
    confidenceEvaluator,
    makePadEvaluator(wiring.getPadCoord),
    makeGoalEvaluator(wiring.getGoalText),
  ];
}
