// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/cognition/MetaReasoner.js — decide HOW to think, not just how much.
//
// boundedRationality.js already answers "how MUCH compute?" (B·H·tokens by complexity).
// The missing half is "which reasoning STRATEGY?" — a mind switches modes by situation:
// snap to a fast answer on the easy stuff (System 1), deliberate carefully when the stakes
// are high (System 2), diverge wide when stuck, or turn skeptical when a claim needs
// breaking. The MetaReasoner is that selector. It reads the situation (complexity, mood,
// uncertainty, stakes) and picks a strategy, which it expresses as a concrete config the
// CognitiveMesh already understands — beam width, debate rounds, attention breadth,
// exploration temperature, synthesis aggressiveness.
//
//   situation ──▶ MetaReasoner.select() ──▶ { strategy, config, rationale }
//                                              │
//                        CognitiveMesh applies config for this run
//
//   INTUITIVE  narrow beam, no debate, few perspectives   → fast, cheap  (System 1)
//   DELIBERATE wide beam, multi-round debate, many lenses  → careful      (System 2)
//   DIVERGENT  huge beam, high exploration, more synthesis → creative / unstuck
//   SKEPTICAL  heavy debate, risk/safety focus, low temp   → verify / stress-test
//
// This is meta-cognition as strategy selection. It does not itself reason about the problem
// domain; it reasons about *how the mesh should reason*, then steps back. Pure and testable.

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/**
 * The reasoning strategies. Each maps to a config the CognitiveMesh consumes. Values are
 * chosen to make the four modes behave qualitatively differently, not just numerically.
 */
export const STRATEGIES = {
  INTUITIVE: {
    id: 'INTUITIVE',
    label: { ko: '직관', en: 'Intuitive' },
    config: { beamWidth: 4, debateRounds: 0, attentionTopK: 3, steps: 1, exploration: 0.2, pairs: 1, elite: 1 },
    blurb: { ko: '빠른 첫 판단 (System 1)', en: 'fast first judgment (System 1)' },
  },
  DELIBERATE: {
    id: 'DELIBERATE',
    label: { ko: '숙의', en: 'Deliberate' },
    config: { beamWidth: 16, debateRounds: 2, attentionTopK: 7, steps: 2, exploration: 0.4, pairs: 2, elite: 2 },
    blurb: { ko: '신중한 다후보 비교 (System 2)', en: 'careful multi-candidate weighing (System 2)' },
  },
  DIVERGENT: {
    id: 'DIVERGENT',
    label: { ko: '발산', en: 'Divergent' },
    config: { beamWidth: 24, debateRounds: 1, attentionTopK: 9, steps: 2, exploration: 0.9, pairs: 4, elite: 3 },
    blurb: { ko: '넓게 탐색해 막힘 돌파', en: 'explore wide to break out of a rut' },
  },
  SKEPTICAL: {
    id: 'SKEPTICAL',
    label: { ko: '회의', en: 'Skeptical' },
    config: { beamWidth: 12, debateRounds: 3, attentionTopK: 5, steps: 3, exploration: 0.15, pairs: 2, elite: 2 },
    blurb: { ko: '반례를 찾으며 검증', en: 'stress-test by hunting counter-evidence' },
  },
};

export class MetaReasoner {
  /**
   * @param {{ strategies?:object, biasToDeliberate?:number }} [opts]
   *   biasToDeliberate: nudge toward careful reasoning when unsure (0~1, default 0.1)
   */
  constructor(opts = {}) {
    this.strategies = opts.strategies || STRATEGIES;
    this.bias = clamp01(opts.biasToDeliberate ?? 0.1);
  }

  /**
   * Score each strategy for the situation and pick the best.
   * @param {{
   *   complexity?:number,   // 0~1 (from boundedRationality) — high → deliberate
   *   uncertainty?:number,  // 0~1 — high → deliberate or skeptical
   *   stakes?:number,       // 0~1 — high → skeptical / deliberate, never intuitive
   *   novelty?:number,      // 0~1 — high (stuck / needs new ideas) → divergent
   *   pad?:{p:number,a:number,d:number},  // mood tilts strategy
   *   verify?:boolean,      // explicit "check this" → skeptical
   * }} situation
   * @returns {{ strategy:string, config:object, scores:object, rationale:string }}
   */
  select(situation = {}) {
    const s = this._features(situation);
    const scores = {
      INTUITIVE:  this._scoreIntuitive(s),
      DELIBERATE: this._scoreDeliberate(s),
      DIVERGENT:  this._scoreDivergent(s),
      SKEPTICAL:  this._scoreSkeptical(s),
    };
    // small standing bias toward DELIBERATE breaks ties safely (careful default)
    scores.DELIBERATE += this.bias;

    const strategy = Object.keys(scores).sort((a, b) => scores[b] - scores[a])[0];
    const chosen = this.strategies[strategy];
    return {
      strategy,
      config: { ...chosen.config },
      scores,
      rationale: this._rationale(strategy, s),
    };
  }

  /** Normalize + derive situation features, including a mood → tendency read. */
  _features(situation) {
    const pad = situation.pad || null;
    // fear/threat (low pleasure, high arousal) → be careful/skeptical
    const threat = pad ? clamp01((-pad.p) * 0.5 + pad.a * 0.5) : 0;
    // positive + aroused → open, divergent
    const openness = pad ? clamp01(pad.p * 0.6 + pad.a * 0.2) : 0;
    return {
      complexity: clamp01(situation.complexity ?? 0.2),
      uncertainty: clamp01(situation.uncertainty ?? 0.2),
      stakes: clamp01(situation.stakes ?? 0.2),
      novelty: clamp01(situation.novelty ?? 0.1),
      verify: situation.verify === true,
      threat, openness,
    };
  }

  // Each strategy's fitness is a small, legible formula — easy to reason about & tune.
  _scoreIntuitive(s) {
    // fast path when the situation is easy and low-stakes. Average (not product) so one
    // mildly-elevated signal doesn't zero it out, but stakes/verify/novelty act as vetoes —
    // we never snap-judge something risky, flagged for checking, or that needs new ideas.
    if (s.verify || s.stakes > 0.5 || s.novelty > 0.5 || s.threat > 0.5) return 0;
    const ease = 1 - (s.complexity * 0.35 + s.uncertainty * 0.3 + s.novelty * 0.2 + s.stakes * 0.15);
    return clamp01(ease);
  }
  _scoreDeliberate(s) {
    return clamp01(0.25 + s.complexity * 0.4 + s.stakes * 0.35 + s.uncertainty * 0.2 + s.threat * 0.25 - s.novelty * 0.4);
  }
  _scoreDivergent(s) {
    return clamp01(s.novelty * 0.9 + s.openness * 0.3 - s.stakes * 0.2 - (s.verify ? 0.6 : 0));
  }
  _scoreSkeptical(s) {
    const base = s.verify ? 0.8 : 0;
    return clamp01(base + s.stakes * 0.4 + s.threat * 0.4 + s.uncertainty * 0.2 - s.novelty * 0.2);
  }

  _rationale(strategy, s) {
    const why = [];
    if (s.verify) why.push('explicit verification requested');
    if (s.stakes > 0.6) why.push('high stakes');
    if (s.novelty > 0.6) why.push('needs new ideas');
    if (s.complexity > 0.6) why.push('complex problem');
    if (s.uncertainty > 0.6) why.push('high uncertainty');
    if (s.threat > 0.6) why.push('threat-tinged mood');
    if (why.length === 0) why.push('routine, low-stakes situation');
    const label = this.strategies[strategy].blurb.en;
    return `${strategy} — ${label} (${why.join(', ')})`;
  }
}
