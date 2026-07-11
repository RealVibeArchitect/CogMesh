// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/cognition/DecompositionEngine.js — split one candidate into many thought-nodes.
//
// The first stage of the Brain-like Parallel Cognitive Mesh. A single candidate is not
// judged as a monolith; it is *decomposed* into several perspective-nodes that can each
// be simulated and evaluated independently, in parallel.
//
//     Candidate A
//        ├─ logic       ─┐
//        ├─ emotion      │
//        ├─ cost         ├─→ each becomes an independent ThoughtNode with its own
//        ├─ risk         │   `action` that the WorldSimulator can roll out.
//        ├─ memory       │
//        └─ …           ─┘
//
// Two decomposition modes are supported:
//   - 'perspective'  one candidate → the same action viewed through N lenses (default)
//   - 'subplan'      one complex plan (candidate.steps[]) → N smaller sub-plan nodes
//
// Dependency-free. It only *shapes* nodes; it never simulates or scores them — that is
// the ParallelWorldSimulation / EvaluationCouncil's job. Each node carries the `action`
// the simulator expects ({ effects, field }) so the rest of the pipeline stays uniform.

/**
 * The ten canonical perspectives the document calls for. Each lens tags a node so the
 * matching Evaluator in the Council can weight it. Lenses are data, not behavior — you
 * can pass your own set to the constructor to specialize a domain.
 */
export const DEFAULT_PERSPECTIVES = [
  'logic', 'emotion', 'cost', 'risk', 'memory',
  'goal', 'world', 'creativity', 'safety', 'confidence',
];

let _seq = 0;
const nextId = (prefix) => `${prefix}${++_seq}`;

/**
 * A ThoughtNode is the atom of the mesh. It records where it came from (parent), the
 * lens it represents, and the concrete `action` a simulator can apply. `meta` is free
 * space later stages (evaluation, conflict) annotate.
 */
export function makeThoughtNode({ parentId = null, lens = 'logic', label = '', action = {}, meta = {} } = {}) {
  return {
    id: nextId('n'),
    parentId,
    lens,
    label: label || lens,
    action: action && typeof action === 'object' ? action : {},
    meta: { ...meta },
  };
}

export class DecompositionEngine {
  /**
   * @param {{ perspectives?: string[], mode?: 'perspective'|'subplan',
   *           lensBias?: (lens:string, candidate:object)=>object }} [opts]
   *   perspectives: which lenses to split a candidate into (default: DEFAULT_PERSPECTIVES)
   *   mode:         default decomposition mode when decompose() isn't told one
   *   lensBias:     optional (lens, candidate) → action-patch, so a lens can *tilt* the
   *                 action it simulates (e.g. the 'risk' node dampens an aggressive field).
   *                 Purely optional; without it every lens simulates the same base action.
   */
  constructor(opts = {}) {
    this.perspectives = Array.isArray(opts.perspectives) && opts.perspectives.length
      ? opts.perspectives.slice()
      : DEFAULT_PERSPECTIVES.slice();
    this.mode = opts.mode === 'subplan' ? 'subplan' : 'perspective';
    this._lensBias = typeof opts.lensBias === 'function' ? opts.lensBias : null;
  }

  /**
   * Decompose one candidate into an array of ThoughtNodes.
   * @param {{ id?:string, action?:object, steps?:Array }} candidate
   * @param {{ mode?: 'perspective'|'subplan', perspectives?: string[] }} [opts]
   * @returns {Array} thought nodes
   */
  decompose(candidate, opts = {}) {
    if (!candidate || typeof candidate !== 'object') return [];
    const mode = opts.mode || this.mode;
    const parentId = candidate.id || nextId('c');

    if (mode === 'subplan') return this._decomposeSubplan(candidate, parentId);
    return this._decomposePerspective(candidate, parentId, opts.perspectives || this.perspectives);
  }

  /**
   * Decompose every candidate in a list, flattening the result. Keeps a back-reference
   * to the originating candidate index in each node's meta for later regrouping.
   * @param {Array} candidates
   * @param {object} [opts]
   */
  decomposeAll(candidates, opts = {}) {
    const list = Array.isArray(candidates) ? candidates : [];
    const nodes = [];
    list.forEach((candidate, idx) => {
      for (const node of this.decompose(candidate, opts)) {
        node.meta.candidateIndex = idx;
        nodes.push(node);
      }
    });
    return nodes;
  }

  // ── perspective mode: same action, N lenses ──────────────────────────────
  _decomposePerspective(candidate, parentId, perspectives) {
    const baseAction = candidate.action && typeof candidate.action === 'object' ? candidate.action : {};
    return perspectives.map((lens) => {
      const bias = this._lensBias ? this._lensBias(lens, candidate) : null;
      const action = bias ? mergeAction(baseAction, bias) : baseAction;
      return makeThoughtNode({
        parentId,
        lens,
        label: `${candidate.id || 'cand'}·${lens}`,
        action,
        meta: { mode: 'perspective', origin: candidate.id ?? null },
      });
    });
  }

  // ── subplan mode: one plan's steps → N smaller nodes ──────────────────────
  _decomposeSubplan(candidate, parentId) {
    const steps = Array.isArray(candidate.steps) ? candidate.steps : [];
    if (steps.length === 0) {
      // nothing to split — fall back to a single node wrapping the whole candidate
      return [makeThoughtNode({
        parentId, lens: 'plan',
        label: candidate.id || 'plan',
        action: candidate.action || {},
        meta: { mode: 'subplan', atomic: true },
      })];
    }
    return steps.map((step, i) => makeThoughtNode({
      parentId,
      lens: 'subplan',
      label: typeof step === 'string' ? step : (step.label || `step ${i + 1}`),
      action: (step && step.action) || candidate.action || {},
      meta: { mode: 'subplan', stepIndex: i },
    }));
  }
}

/** Deep-ish merge of two actions ({ effects, field }) without mutating either input. */
function mergeAction(base, patch) {
  const out = { ...base };
  if (patch.field || base.field) out.field = { ...(base.field || {}), ...(patch.field || {}) };
  if (patch.effects || base.effects) {
    out.effects = { ...(base.effects || {}) };
    for (const [k, v] of Object.entries(patch.effects || {})) {
      out.effects[k] = { ...(base.effects?.[k] || {}), ...v };
    }
  }
  return out;
}

export { mergeAction };
