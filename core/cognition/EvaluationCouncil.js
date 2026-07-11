// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/cognition/EvaluationCouncil.js — many evaluators judge, then debate, one verdict.
//
// Stage 3 of the mesh, and the one the document is most insistent about: the council must
// NOT just average scores. Each evaluator judges every candidate from its own perspective,
// producing a structured verdict:
//
//     { score, confidence, reason, strength, weakness, improvement }
//
// Then the council runs Debate → Critique → Peer-Review → Refine: evaluators also judge
// *each other's* verdicts, and a verdict that peers find unconvincing loses weight. The
// final score is a peer-weighted, confidence-weighted aggregate — not a flat mean.
//
//     candidate
//       ├─ Logic evaluator      → verdict₁ ─┐
//       ├─ Emotion evaluator    → verdict₂  │  peer review: each evaluator rates the
//       ├─ Confidence evaluator → verdict₃  ├─ others' verdicts (agree / dispute)
//       └─ …                                │
//                                           ↓
//                          refined, peer-weighted council score
//
// An Evaluator is a plain object: { id, evaluate(candidate, ctx) → verdict }. The council
// ships adapters that wrap CogMesh's existing modules (confidence, PAD, world score) as
// evaluators, so this stage *reuses* the mesh rather than duplicating it.

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** Normalize whatever an evaluator returns into the canonical verdict shape. */
export function normalizeVerdict(evaluatorId, raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    evaluatorId,
    score: Number.isFinite(r.score) ? r.score : 0,
    confidence: clamp01(Number.isFinite(r.confidence) ? r.confidence : 0.5),
    reason: typeof r.reason === 'string' ? r.reason : '',
    strength: typeof r.strength === 'string' ? r.strength : '',
    weakness: typeof r.weakness === 'string' ? r.weakness : '',
    improvement: typeof r.improvement === 'string' ? r.improvement : '',
  };
}

export class EvaluationCouncil {
  /**
   * @param {Array<{id:string, evaluate:Function, review?:Function, weight?:number}>} evaluators
   * @param {{ debateRounds?: number, peerWeight?: number }} [opts]
   *   debateRounds: how many peer-review passes to run (default 1; 0 = skip debate)
   *   peerWeight:   how strongly peer opinion moves an evaluator's weight (0~1, default 0.5)
   */
  constructor(evaluators = [], opts = {}) {
    this.evaluators = Array.isArray(evaluators) ? evaluators.filter((e) => e && typeof e.evaluate === 'function') : [];
    this.debateRounds = Number.isFinite(opts.debateRounds) ? Math.max(0, opts.debateRounds) : 1;
    this.peerWeight = clamp01(opts.peerWeight ?? 0.5);
    this._reindex();
  }

  /** Add an evaluator to the council (chainable). */
  add(evaluator) {
    if (evaluator && typeof evaluator.evaluate === 'function') {
      this.evaluators.push(evaluator);
      this._reindex();
    }
    return this;
  }

  /** Rebuild the id → evaluator index (hoisted out of the hot debate loop). */
  _reindex() {
    this._byId = new Map(this.evaluators.map((e) => [e.id, e]));
  }

  /**
   * Evaluate a single candidate: gather verdicts, run debate, return a refined result.
   * @param {object} candidate  a simulated node ({ id, lens, score, future, action, ... })
   * @param {object} [ctx]      passed through to each evaluator
   * @returns {{ candidate:object, verdicts:Array, councilScore:number,
   *             agreement:number, summary:object }}
   */
  evaluate(candidate, ctx = {}) {
    // ── round 0: independent verdicts ────────────────────────────────────
    const verdicts = this.evaluators.map((ev) => {
      let raw;
      try { raw = ev.evaluate(candidate, ctx); }
      catch { raw = { score: 0, confidence: 0, reason: 'evaluator error' }; }
      const v = normalizeVerdict(ev.id, raw);
      // baseWeight: declared weight × the evaluator's own confidence in this verdict
      v._baseWeight = clamp01((ev.weight ?? 1) * v.confidence);
      v._peerWeight = v._baseWeight; // refined during debate
      return v;
    });

    if (verdicts.length === 0) {
      return { candidate, verdicts, councilScore: candidate.score ?? 0, agreement: 1, summary: emptySummary() };
    }

    // ── debate rounds: peers rate each other's verdicts ──────────────────
    for (let round = 0; round < this.debateRounds; round++) {
      this._debateRound(candidate, verdicts, ctx);
    }

    // ── aggregate: peer- & confidence-weighted mean, NOT a flat average ───
    const councilScore = weightedMean(verdicts.map((v) => v.score), verdicts.map((v) => v._peerWeight));
    const agreement = this._agreement(verdicts);

    return {
      candidate,
      verdicts,
      councilScore,
      agreement,
      summary: this._summarize(verdicts),
    };
  }

  /**
   * Evaluate and rank a whole list of candidates.
   * @param {Array} candidates
   * @param {object} [ctx]
   * @returns {{ ranked:Array, best:object|null }}
   */
  deliberate(candidates, ctx = {}) {
    const list = Array.isArray(candidates) ? candidates : [];
    const ranked = list
      .map((c) => this.evaluate(c, ctx))
      .sort((a, b) => b.councilScore - a.councilScore);
    return { ranked, best: ranked[0] || null };
  }

  // ── one debate pass ───────────────────────────────────────────────────
  // Each evaluator with a review() rates every *other* verdict's persuasiveness (0~1).
  // A verdict endorsed by peers keeps its weight; one peers dispute is discounted.
  _debateRound(candidate, verdicts, ctx) {
    const byId = this._byId; // hoisted index — no per-candidate Map rebuild
    for (const target of verdicts) {
      // weight each peer's opinion by that peer's own confidence (inline weighted mean —
      // this loop runs evaluators² times per candidate, so avoid per-opinion allocations)
      let num = 0, den = 0, sum = 0, count = 0;
      for (const other of verdicts) {
        if (other.evaluatorId === target.evaluatorId) continue;
        const reviewer = byId.get(other.evaluatorId);
        let endorsement = defaultEndorsement(target, other);
        if (reviewer && typeof reviewer.review === 'function') {
          try {
            const r = reviewer.review(target, candidate, ctx);
            if (r && Number.isFinite(r.endorsement)) endorsement = clamp01(r.endorsement);
          } catch { /* reviewer error → keep default endorsement */ }
        }
        const w = Number.isFinite(other._baseWeight) ? other._baseWeight : 0;
        num += endorsement * w; den += w; sum += endorsement; count++;
      }
      // same semantics as weightedMean(): weighted mean, plain mean when all weights are 0
      const peerScore = count === 0 ? 0.5 : (den > 0 ? num / den : sum / count);
      // blend base weight with peer endorsement
      target._peerWeight = clamp01(
        target._baseWeight * (1 - this.peerWeight) + target._baseWeight * peerScore * this.peerWeight * 2
      );
    }
  }

  /** Agreement = 1 − normalized spread of verdict scores (1 = unanimous). */
  _agreement(verdicts) {
    const scores = verdicts.map((v) => v.score);
    if (scores.length < 2) return 1;
    const m = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((a, b) => a + (b - m) ** 2, 0) / scores.length;
    const spread = Math.sqrt(variance);
    const range = Math.max(...scores) - Math.min(...scores) || 1;
    return clamp01(1 - spread / range);
  }

  /** Collect the strongest strength / weakness / improvement across the council. */
  _summarize(verdicts) {
    const pick = (field) => verdicts
      .filter((v) => v[field])
      .sort((a, b) => b._peerWeight - a._peerWeight)
      .map((v) => ({ from: v.evaluatorId, text: v[field] }));
    return {
      strengths: pick('strength'),
      weaknesses: pick('weakness'),
      improvements: pick('improvement'),
    };
  }
}

function emptySummary() { return { strengths: [], weaknesses: [], improvements: [] }; }

/** A peer with no explicit review endorses more when its own verdict agrees in sign/size. */
function defaultEndorsement(target, other) {
  const diff = Math.abs(target.score - other.score);
  const scale = Math.max(1, Math.abs(target.score), Math.abs(other.score));
  return clamp01(1 - diff / scale);
}

function weightedMean(values, weights) {
  let num = 0, den = 0;
  for (let i = 0; i < values.length; i++) {
    const w = Number.isFinite(weights[i]) ? weights[i] : 0;
    num += values[i] * w; den += w;
  }
  return den > 0 ? num / den : (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
}

export { clamp01, weightedMean };
