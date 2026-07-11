// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/agent/meshPolicy.js — let the cognitive mesh drive the agent.
//
// The AgentLoop needs a policy: observation → next action. This bridge makes that policy be
// the CognitiveMesh's reasoning, closing the loop between thinking and acting:
//
//     AgentLoop.OBSERVE ─▶ meshPolicy ─▶ CognitiveMesh reasons over "which tool, if any?"
//                                   └─▶ returns { type:'tool'|'finish', ... }
//
// How it decides: each available tool becomes a candidate action; the mesh (or, in the
// lightweight default, a scoring heuristic) evaluates them against the goal + what's already
// been observed, and the best-scoring tool is invoked. When no tool improves on "answer now"
// — or the goal already appears satisfied by the last result — it finishes.
//
// This is deliberately a *thin* bridge with a pure-function default so it's fully testable
// without a live mesh; pass a real CognitiveMesh (or an LLM decider) to upgrade the decision
// quality. It is the seam where reasoning meets grounding.

/**
 * Build an agent policy backed by a decision function. The default decider is a transparent
 * heuristic (keyword overlap between the goal and each tool's description, minus tools
 * already used unproductively). Swap `decide` for a CognitiveMesh- or LLM-based decider.
 *
 * @param {object} deps
 * @param {import('./Tool.js').ToolRegistry} deps.tools
 * @param {(observation:object, candidates:Array) => (object|Promise<object>)} [deps.decide]
 *        returns { tool, args, score } | { finish:true, answer } given scored candidates.
 * @param {{ finishThreshold?:number, maxToolRepeats?:number }} [deps.config]
 * @returns {(observation:object) => Promise<object>} an AgentLoop policy
 */
export function meshPolicy(deps = {}) {
  if (!deps.tools) throw new Error('[meshPolicy] a ToolRegistry is required');
  const tools = deps.tools;
  const decide = typeof deps.decide === 'function' ? deps.decide : defaultDecide;
  const cfg = deps.config || {};
  const finishThreshold = Number.isFinite(cfg.finishThreshold) ? cfg.finishThreshold : 0.1;
  const maxToolRepeats = Number.isFinite(cfg.maxToolRepeats) ? cfg.maxToolRepeats : 2;

  return async function policy(observation) {
    // finish if the goal looks satisfied by the last successful result
    if (observation.lastResult?.ok && looksDone(observation)) {
      return { type: 'finish', answer: observation.lastResult.result, thought: 'goal satisfied by last result' };
    }

    // build candidate actions from the tools, skipping ones already over-used
    const usedCount = countToolUse(observation.history);
    const candidates = tools.list()
      .filter((t) => (usedCount.get(t.name) || 0) < maxToolRepeats)
      .map((t) => ({ tool: t.name, description: t.description }));

    if (candidates.length === 0) {
      return { type: 'finish', answer: observation.lastResult?.result ?? null, thought: 'no fresh tools left' };
    }

    const decision = await decide(observation, candidates);
    if (!decision || decision.finish || !decision.tool) {
      return { type: 'finish', answer: decision?.answer ?? observation.lastResult?.result ?? null, thought: 'decider chose to finish' };
    }
    if (Number.isFinite(decision.score) && decision.score < finishThreshold) {
      return { type: 'finish', answer: observation.lastResult?.result ?? null, thought: 'no tool scored above threshold' };
    }
    return { type: 'tool', tool: decision.tool, args: decision.args || {}, thought: decision.thought || `use ${decision.tool}` };
  };
}

// ── default transparent decider ──────────────────────────────────────────────
// Keyword-overlap scoring between the goal and each tool's description. It's a stand-in for
// the mesh/LLM — good enough to route obvious cases and to make the loop testable.
function defaultDecide(observation, candidates) {
  const goalWords = tokenize(`${observation.goal} ${JSON.stringify(observation.lastResult?.result ?? '')}`);
  let best = null;
  for (const c of candidates) {
    const words = [...tokenize(c.description)];
    const overlap = words.reduce((n, w) => n + (goalWords.has(w) ? 1 : 0), 0);
    const score = words.length ? overlap / words.length : 0;
    if (!best || score > best.score) best = { tool: c.tool, score, args: {} };
  }
  return best || { finish: true };
}

/**
 * Wrap a CognitiveMesh as the decider: it imagines each candidate tool as an action and
 * picks the highest-scoring one. Requires the caller to provide an `actionFor(tool,
 * observation)` that maps a tool to a World-Model action the mesh can simulate. Optional —
 * only used when a caller wants mesh-quality tool selection.
 * @param {object} mesh   a CognitiveMesh
 * @param {(tool:string, observation:object)=>object} actionFor
 */
export function meshDecider(mesh, actionFor) {
  return (observation, candidates) => {
    let best = null;
    for (const c of candidates) {
      const action = actionFor(c.tool, observation);
      const rollout = mesh.simulator.rollout(action, { steps: 1 });
      if (!best || rollout.score > best.score) best = { tool: c.tool, score: rollout.score, args: action.args || {} };
    }
    return best || { finish: true };
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────
function tokenize(s) {
  return new Set(String(s || '').toLowerCase().split(/[^a-z0-9가-힣]+/).filter((w) => w.length > 1));
}

function countToolUse(history) {
  const counts = new Map();
  for (const h of history || []) {
    if (h.decision?.type === 'tool') counts.set(h.decision.tool, (counts.get(h.decision.tool) || 0) + 1);
  }
  return counts;
}

/** Heuristic "am I done?": we have a successful result and the goal reads as a one-shot ask. */
function looksDone(observation) {
  const usedTools = observation.history.filter((h) => h.decision?.type === 'tool').length;
  // once at least one tool has produced a good result, a single-step goal is satisfied.
  // multi-step goals keep going because their policy/decider will request more tools.
  return usedTools >= 1 && observation.step >= observation.maxSteps - 1 ? true : false;
}
