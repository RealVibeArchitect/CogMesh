// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/cognition/ConflictSynthesis.js — collide good ideas, fuse them into new ones.
//
// Stage 4 of the mesh. Instead of just picking the single best candidate, the mesh takes
// the *top* survivors and deliberately collides them: where A is fast and B is accurate,
// it asks "why fast? why accurate? what contradicts? what's shared?" and then SYNTHESIZES
// a genuinely new candidate that tries to keep both strengths. That synthesized candidate
// is fed back into Generate (Regeneration), so the loop can improve on its own best work.
//
//     top A ─┐                         ┌─ shared traits kept
//            ├─ ConflictEngine ─→ tension analysis ─→ SynthesisEngine ─→ new candidate
//     top B ─┘                         └─ opposing traits reconciled
//                                                            │
//                                                 RegenerationEngine → back to Generate
//
// These engines operate on `action` objects ({ effects, field }), so a "synthesis" is a
// concrete, simulatable action — not just prose. Everything is dependency-free and pure.

const num = (v, d = 0) => (Number.isFinite(v) ? v : d);

/**
 * ConflictEngine — analyze the tension between two candidates. It compares their actions
 * field-by-field and classifies each shared field as `shared` (same direction) or
 * `opposed` (different values), and lists fields unique to each side. This structured
 * tension is what the SynthesisEngine reconciles.
 */
export class ConflictEngine {
  /**
   * @param {object} a  a candidate/node with an `.action`
   * @param {object} b  another candidate/node with an `.action`
   * @returns {{ shared:object, opposed:object, onlyA:object, onlyB:object,
   *             tension:number, questions:string[] }}
   */
  analyze(a, b) {
    const fa = flattenAction(a?.action);
    const fb = flattenAction(b?.action);
    const shared = {}, opposed = {}, onlyA = {}, onlyB = {};

    for (const k of Object.keys(fa)) {
      if (!(k in fb)) { onlyA[k] = fa[k]; continue; }
      if (approxEqual(fa[k], fb[k])) shared[k] = fa[k];
      else opposed[k] = { a: fa[k], b: fb[k] };
    }
    for (const k of Object.keys(fb)) if (!(k in fa)) onlyB[k] = fb[k];

    const opposedCount = Object.keys(opposed).length;
    const total = new Set([...Object.keys(fa), ...Object.keys(fb)]).size || 1;
    const tension = opposedCount / total;

    return {
      shared, opposed, onlyA, onlyB, tension,
      questions: buildQuestions(a, b, opposed),
    };
  }
}

/**
 * SynthesisEngine — turn a conflict analysis into a NEW candidate action. The rule set:
 *   - keep every shared field as-is (both agreed)
 *   - for opposed fields, blend toward the side whose parent scored higher (or midpoint)
 *   - carry over fields unique to either side (union of ideas)
 * The result is a fresh action that is not identical to either parent — the document's
 * "not a simple merge, a new thought" requirement.
 */
export class SynthesisEngine {
  /**
   * @param {object} a  candidate/node (may carry `.councilScore` or `.score`)
   * @param {object} b  candidate/node
   * @param {object} conflict  the ConflictEngine.analyze(a, b) result
   * @returns {{ id:string, action:object, provenance:object }}
   */
  synthesize(a, b, conflict) {
    const wa = weightOf(a), wb = weightOf(b);
    const bias = wa + wb > 0 ? wa / (wa + wb) : 0.5; // lean toward the stronger parent

    const flat = { ...conflict.shared };
    for (const [k, v] of Object.entries(conflict.opposed)) {
      flat[k] = blendValue(v.a, v.b, bias);
    }
    Object.assign(flat, conflict.onlyA, conflict.onlyB); // union of unique ideas

    return {
      id: synthId(a, b),
      action: unflattenAction(flat),
      provenance: {
        parents: [a?.id ?? null, b?.id ?? null],
        bias, tension: conflict.tension,
        kept: Object.keys(conflict.shared),
        reconciled: Object.keys(conflict.opposed),
        merged: [...Object.keys(conflict.onlyA), ...Object.keys(conflict.onlyB)],
      },
    };
  }
}

/**
 * RegenerationEngine — take the top survivors, pair the strongest ones, and emit a fresh
 * generation of candidates: the synthesized offspring PLUS the elite parents (elitism, so
 * the loop never loses its best work). This closes the cycle back to Generate.
 */
export class RegenerationEngine {
  /**
   * @param {{ conflict?:ConflictEngine, synthesis?:SynthesisEngine,
   *           elite?:number, pairs?:number }} [opts]
   *   elite: how many top candidates to carry forward unchanged
   *   pairs: how many top-pairs to collide & synthesize
   */
  constructor(opts = {}) {
    this.conflict = opts.conflict || new ConflictEngine();
    this.synthesis = opts.synthesis || new SynthesisEngine();
    this.elite = Number.isFinite(opts.elite) ? Math.max(0, opts.elite) : 2;
    this.pairs = Number.isFinite(opts.pairs) ? Math.max(0, opts.pairs) : 2;
  }

  /**
   * @param {Array} ranked  candidates sorted best-first (each with `.action`)
   * @returns {{ nextGeneration:Array, syntheses:Array }}
   */
  regenerate(ranked) {
    const list = Array.isArray(ranked) ? ranked : [];
    const elites = list.slice(0, this.elite).map((c) => ({ ...c, meta: { ...(c.meta || {}), elite: true } }));

    const syntheses = [];
    // collide the best candidate with the strongest *distinct* others. "Distinct" means a
    // different action — colliding near-duplicates yields nothing, so we skip them and
    // reach further down the beam for a genuine counterpart worth reconciling.
    const anchor = list[0];
    if (anchor) {
      for (let i = 1; i < list.length && syntheses.length < this.pairs; i++) {
        const conflict = this.conflict.analyze(anchor, list[i]);
        const novel = conflict.tension > 0
          || Object.keys(conflict.onlyA).length > 0
          || Object.keys(conflict.onlyB).length > 0;
        if (!novel) continue; // identical actions — nothing new to synthesize
        const child = this.synthesis.synthesize(anchor, list[i], conflict);
        syntheses.push({ ...child, conflict, meta: { synthesized: true, generation: true } });
      }
    }

    return { nextGeneration: [...elites, ...syntheses], syntheses };
  }
}

// ── helpers ────────────────────────────────────────────────────────────────

/** Flatten an action into dotted keys: { 'field.wealth': 160, 'effects.samsung.price': 85000 } */
function flattenAction(action) {
  const out = {};
  if (!action || typeof action !== 'object') return out;
  for (const [k, v] of Object.entries(action.field || {})) out[`field.${k}`] = v;
  for (const [obj, patch] of Object.entries(action.effects || {})) {
    for (const [k, v] of Object.entries(patch || {})) out[`effects.${obj}.${k}`] = v;
  }
  return out;
}

/** Inverse of flattenAction. */
function unflattenAction(flat) {
  const action = {};
  for (const [path, v] of Object.entries(flat)) {
    const parts = path.split('.');
    if (parts[0] === 'field') {
      (action.field ||= {})[parts[1]] = v;
    } else if (parts[0] === 'effects') {
      const obj = ((action.effects ||= {})[parts[1]] ||= {});
      obj[parts[2]] = v;
    }
  }
  return action;
}

function approxEqual(x, y) {
  if (typeof x === 'number' && typeof y === 'number') return Math.abs(x - y) < 1e-9;
  return x === y;
}

/** Blend two values toward `bias` (0 → all b, 1 → all a). Non-numbers pick the biased side. */
function blendValue(a, b, bias) {
  if (typeof a === 'number' && typeof b === 'number') return a * bias + b * (1 - bias);
  return bias >= 0.5 ? a : b;
}

function weightOf(c) {
  return Math.max(0, num(c?.councilScore, num(c?.score, 0)));
}

function buildQuestions(a, b, opposed) {
  const qs = [];
  const ida = a?.label || a?.id || 'A';
  const idb = b?.label || b?.id || 'B';
  for (const k of Object.keys(opposed)) {
    qs.push(`why does ${ida} favor ${k}=${fmt(opposed[k].a)} while ${idb} favors ${k}=${fmt(opposed[k].b)}?`);
  }
  if (qs.length === 0) qs.push(`what do ${ida} and ${idb} share that a stronger third option could keep?`);
  return qs;
}

const fmt = (v) => (typeof v === 'number' ? (Math.round(v * 1000) / 1000) : String(v));

let _synth = 0;
function synthId(a, b) {
  return `syn${++_synth}(${a?.id ?? '?'}×${b?.id ?? '?'})`;
}

export { flattenAction, unflattenAction };
