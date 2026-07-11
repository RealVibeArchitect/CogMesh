// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/cognition/AttentionManager.js — decide what to think about.
//
// The mesh decomposes every candidate into ~10 fixed perspectives (logic, emotion, cost,
// risk, …) and spends equal compute on each. But a mind doesn't attend to everything
// equally: a financial question pulls attention to cost/risk; a creative one to novelty;
// a fearful mood narrows attention to safety. The AttentionManager is that missing layer —
// it scores each perspective for the CURRENT situation and selects the top few to attend
// to, so compute (and the mesh's "focus") concentrates where it matters.
//
//   situation (goal text + PAD mood + recent focus)
//        ↓   score every perspective
//   [ risk 0.9, cost 0.8, logic 0.6, … creativity 0.1 ]
//        ↓   keep top-K (+ always-on safety floor)
//   attended perspectives → DecompositionEngine only splits into these
//
// Effects: fewer nodes per candidate → less simulation (works WITH the rollout cache and
// worker pool), and the surviving nodes are the situationally relevant ones → better focus.
// It degrades gracefully: with no signal it returns a sensible default spread, never empty.
//
// This is attention as *selection under a salience model*, not neural soft-attention — it
// governs which cognitive perspectives get resources, which is the meaning the design doc
// intends ("decide what to focus on in the current situation").

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/**
 * Keyword salience: which words in a goal pull attention toward which perspective. Data,
 * not code — extend per domain. Bilingual (KO/EN) to match the project's usage.
 */
export const DEFAULT_SALIENCE = {
  risk:       ['risk', 'danger', 'safe', 'loss', 'lose', 'volatil', 'hedge', '위험', '손실', '안전', '리스크'],
  cost:       ['cost', 'cheap', 'expensive', 'budget', 'price', 'efficient', '비용', '가격', '예산', '효율'],
  logic:      ['why', 'prove', 'reason', 'because', 'consistent', 'correct', '왜', '증명', '논리', '이유'],
  emotion:    ['feel', 'happy', 'sad', 'afraid', 'angry', 'mood', '기분', '감정', '행복', '두려'],
  goal:       ['goal', 'want', 'achieve', 'objective', 'target', '목표', '원하', '달성'],
  memory:     ['remember', 'past', 'before', 'history', 'recall', '기억', '과거', '이전', '역사'],
  world:      ['predict', 'future', 'happen', 'outcome', 'simulate', '예측', '미래', '결과'],
  creativity: ['new', 'creative', 'idea', 'novel', 'imagine', 'invent', '새로운', '창의', '아이디어', '상상'],
  safety:     ['safe', 'harm', 'protect', 'secure', 'ethic', '안전', '보호', '해로', '윤리'],
  confidence: ['sure', 'certain', 'confident', 'doubt', 'trust', '확신', '신뢰', '의심'],
};

export class AttentionManager {
  /**
   * @param {{ perspectives?:string[], salience?:object, topK?:number,
   *           alwaysOn?:string[], moodWeight?:number }} [opts]
   *   perspectives: the full set to select from (default: keys of the salience map)
   *   topK:         how many perspectives to attend to (default 5)
   *   alwaysOn:     perspectives that are ALWAYS attended regardless of score
   *                 (default ['safety'] — never stop attending to safety)
   *   moodWeight:   how strongly PAD mood shifts attention (0~1, default 0.4)
   */
  constructor(opts = {}) {
    this.salience = opts.salience || DEFAULT_SALIENCE;
    this.perspectives = Array.isArray(opts.perspectives) && opts.perspectives.length
      ? opts.perspectives.slice()
      : Object.keys(this.salience);
    this.topK = Number.isFinite(opts.topK) ? Math.max(1, opts.topK) : 5;
    this.alwaysOn = Array.isArray(opts.alwaysOn) ? opts.alwaysOn : ['safety'];
    this.moodWeight = clamp01(opts.moodWeight ?? 0.4);
  }

  /**
   * Score every perspective for the current situation. Returns a map perspective → salience
   * in [0,1]. Combines three signals: goal-keyword match, PAD mood tilt, and recent focus.
   * @param {{ goal?:string, pad?:{p:number,a:number,d:number}, recentFocus?:string[] }} situation
   */
  score(situation = {}) {
    const goal = (situation.goal || '').toLowerCase();
    const pad = situation.pad || null;
    const recent = new Set(situation.recentFocus || []);
    const moodTilt = pad ? this._moodTilt(pad) : {};

    const scores = {};
    for (const p of this.perspectives) {
      // signal 1: keyword salience from the goal text
      const words = this.salience[p] || [];
      const hits = words.reduce((n, w) => n + (goal.includes(w) ? 1 : 0), 0);
      const kw = words.length ? clamp01(hits / Math.min(3, words.length)) : 0;

      // signal 2: mood tilt (fear → safety/risk, curiosity → creativity, …)
      const mood = clamp01(moodTilt[p] ?? 0);

      // signal 3: recency — perspectives we just attended to keep a little pull
      const rec = recent.has(p) ? 0.2 : 0;

      // blend: keyword is the base; mood and recency adjust it. A small floor keeps every
      // perspective barely alive so nothing is *permanently* unthinkable.
      scores[p] = clamp01(0.1 + 0.6 * kw + this.moodWeight * mood + rec);
    }
    // always-on perspectives are pinned to full salience
    for (const p of this.alwaysOn) if (p in scores) scores[p] = 1;
    return scores;
  }

  /**
   * Select which perspectives to attend to: the top-K by salience, plus any always-on.
   * @param {object} situation  (see score())
   * @returns {{ attended:string[], scores:object, dropped:string[] }}
   */
  attend(situation = {}) {
    const scores = this.score(situation);
    const ranked = Object.keys(scores).sort((a, b) => scores[b] - scores[a]);
    const attended = [];
    const pin = new Set(this.alwaysOn);

    // pinned first (guaranteed), then fill to topK by salience
    for (const p of ranked) {
      if (pin.has(p)) attended.push(p);
    }
    for (const p of ranked) {
      if (attended.length >= this.topK) break;
      if (!attended.includes(p)) attended.push(p);
    }
    const dropped = ranked.filter((p) => !attended.includes(p));
    return { attended, scores, dropped };
  }

  /**
   * Attention as node priority: given decomposed nodes, tag each with meta.priority equal
   * to its lens's salience, so the ResourceManager admits high-attention nodes first when
   * the budget is tight. Complements attend() (which prunes) with a soft ordering.
   * @param {Array} nodes
   * @param {object} situation
   */
  prioritize(nodes, situation = {}, precomputedScores = null) {
    // reuse the scores attend() already computed this cycle when the caller passes them —
    // one salience model per cycle (consistent) and one fewer full score() pass (faster)
    const scores = precomputedScores || this.score(situation);
    return (Array.isArray(nodes) ? nodes : []).map((n) => {
      const s = scores[n.lens] ?? 0.1;
      return { ...n, meta: { ...n.meta, priority: s, attention: s } };
    });
  }

  /** PAD mood → per-perspective tilt. Fear narrows to safety/risk; positive opens creativity. */
  _moodTilt({ p = 0, a = 0, d = 0 } = {}) {
    const tilt = {};
    // low pleasure + high arousal ≈ fear/threat → attend to safety & risk
    const threat = clamp01((-p) * 0.5 + a * 0.5);
    tilt.safety = threat;
    tilt.risk = threat;
    // high pleasure ≈ positive → open up to creativity & goal pursuit
    const positive = clamp01(p);
    tilt.creativity = positive * 0.8;
    tilt.goal = positive * 0.5;
    // high dominance ≈ confident/in-control → lean on logic
    tilt.logic = clamp01(d) * 0.5;
    // high arousal alone → world prediction (vigilance about what happens next)
    tilt.world = clamp01(a) * 0.4;
    return tilt;
  }
}
