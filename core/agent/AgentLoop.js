// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/agent/AgentLoop.js — observe → decide → act → observe, until done.
//
// The cognitive mesh reasons in imagination; the AgentLoop is how CogMesh acts in the real
// world and learns from what actually happens. It runs the classic agent cycle:
//
//     ┌─ OBSERVE  gather the current state (goal, history, last tool result)
//     │      ↓
//     │   DECIDE   a policy picks the next action: call a tool, or finish
//     │      ↓
//     │   ACT      invoke the chosen tool; capture the real result (or error)
//     │      ↓
//     └───(repeat until the policy says done, or a limit is hit)
//
// The DECIDE step is a pluggable `policy(observation) → action`. This is the seam where a
// rule-based controller, the CognitiveMesh, or an LLM plugs in — the loop itself is
// policy-agnostic. That keeps the loop fully testable with a deterministic policy while
// leaving the door open for a learned/LLM decider.
//
// Grounding + robustness guarantees:
//   • bounded: never exceeds maxSteps (no runaway agents).
//   • fault-tolerant: a failing tool becomes an observation, not a crash — the policy can
//     react to the error and try something else.
//   • transparent: returns the full trace (every observation, decision, and result).
//   • safe mode: restrict to side-effect-free tools for untrusted goals.

/**
 * @typedef {{ type:'tool', tool:string, args?:object, thought?:string }
 *         | { type:'finish', answer?:any, thought?:string }} AgentAction
 */

export class AgentLoop {
  /**
   * @param {object} deps
   * @param {import('./Tool.js').ToolRegistry} deps.tools   the tool registry
   * @param {(observation:object) => (AgentAction|Promise<AgentAction>)} deps.policy
   *        the DECIDE step: given the observation, return the next action.
   * @param {import('../constitution/ConstitutionRuntime.js').ConstitutionRuntime} [deps.constitution]
   *        OPTIONAL. If provided, every tool call is gated by the Constitution runtime before it
   *        executes: the loop calls runtime.gate() at the ACT step, and a HALT/escalation becomes a
   *        tool-result-shaped observation the policy can react to (never a crash). Absent it, the
   *        loop behaves exactly as before (ungoverned) — governance is opt-in, so existing behavior
   *        is unchanged.
   * @param {{ maxSteps?:number, safeOnly?:boolean }} [deps.config]
   */
  constructor(deps = {}) {
    if (!deps.tools) throw new Error('[AgentLoop] a ToolRegistry is required');
    if (typeof deps.policy !== 'function') throw new Error('[AgentLoop] a policy(observation) is required');
    this.tools = deps.tools;
    this.policy = deps.policy;
    this.constitution = deps.constitution || null; // optional governance layer
    // OPTIONAL mood coupling: if both a mood provider and a mood-constraint policy are supplied,
    // the loop reads a caution signal each step and lets it TIGHTEN (never loosen) the gate intent
    // before governance sees it. moodProvider() → { caution:number } (or a full reasoning-params
    // object). Absent ⇒ no mood coupling, identical behavior to before.
    this.moodProvider = typeof deps.moodProvider === 'function' ? deps.moodProvider : null;
    this.moodPolicy = deps.moodPolicy || null;
    const cfg = deps.config || {};
    this.maxSteps = Number.isFinite(cfg.maxSteps) ? Math.max(1, cfg.maxSteps) : 10;
    this.safeOnly = cfg.safeOnly === true;
  }

  /**
   * Run the loop for a goal.
   * @param {string} goal
   * @param {object} [ctx]  passed to tools and surfaced to the policy
   * @returns {Promise<{
   *   goal:string, answer:any, done:boolean, steps:number,
   *   trace:Array, stopReason:string
   * }>}
   */
  async run(goal, ctx = {}) {
    const catalog = this.tools.catalog({ safeOnly: this.safeOnly });
    const history = [];
    let lastResult = null;
    let answer = null;
    let done = false;
    let stopReason = 'completed';

    // ── ADMIT: open a constitutional session for this run (if governed) ──
    // `await` is a no-op for the in-process ConstitutionRuntime (sync) and the real boundary
    // round-trip for the IsolatedAdjudicator (async) — one loop drives both.
    let govCtx = null;
    if (this.constitution) {
      const admission = await this.constitution.admit({ origin: 'agent-loop', goal });
      govCtx = admission.ctx;
    }

    let step = 0;
    for (; step < this.maxSteps; step++) {
      // ── OBSERVE ──────────────────────────────────────────────────────
      const observation = {
        goal,
        step,
        maxSteps: this.maxSteps,
        toolCatalog: catalog,
        history: history.slice(),   // defensive copy
        lastResult,
        ctx,
      };

      // ── DECIDE ───────────────────────────────────────────────────────
      let action;
      try {
        action = await this.policy(observation);
      } catch (err) {
        stopReason = `policy error: ${String(err && err.message || err)}`;
        break;
      }
      if (!action || typeof action !== 'object') {
        stopReason = 'policy returned no action';
        break;
      }

      // finishing
      if (action.type === 'finish') {
        answer = action.answer ?? null;
        done = true;
        history.push({ step, decision: action, result: null });
        stopReason = 'policy finished';
        break;
      }

      // ── ACT ──────────────────────────────────────────────────────────
      if (action.type !== 'tool' || !action.tool) {
        stopReason = 'policy returned an invalid action';
        history.push({ step, decision: action, result: null });
        break;
      }
      // enforce safe-only mode
      if (this.safeOnly) {
        const t = this.tools.get(action.tool);
        if (!t || !t.safe) {
          const result = { tool: action.tool, ok: false, error: 'blocked: not a safe tool', args: action.args || {} };
          lastResult = result;
          history.push({ step, decision: action, result });
          continue; // let the policy react to the block
        }
      }

      // ── GOVERN: gate the tool call through the Constitution (if governed) ──
      let moodInfo = null; // mood tightening applied this step (for the trace); null if no mood coupling
      if (this.constitution) {
        const tool = this.tools.get(action.tool);
        const gov = (tool && tool.governance) || null;
        const intent = {
          action: `tool:${action.tool}`,
          args: action.args || {},
          requiresToken: true,
          // classify the tool call for the pipeline: a plain tool call is a conservative action;
          // a tool flagged power-increasing (or self-modifying) will be escalated by the pipeline.
          kind: 'action',
          exposureDelta: toolExposure(tool, action.args || {}),
        };
        // thread the tool's DECLARED governance nature into the intent, so the S-1 calibration
        // gate and S-4 tiering / self-mod checks fire on a real agent action — not just in unit
        // tests. A tool that declares nothing special produces exactly the old conservative intent.
        if (gov) {
          if (gov.irreversible) intent.irreversible = true;
          if (gov.oracleClass) intent.oracleReliance = { actionClass: gov.oracleClass };
          if (gov.reachExpands) intent.reachExpands = true;
          if (gov.selfModify) {
            intent.selfModify = true;
            // a self-modifying tool must supply an evaluator proof + its ground-truth harm class;
            // the loop forwards whatever the tool declared (the gate judges the change's nature).
            intent.evaluatorProof = action.args?.evaluatorProof || ctx?._evaluatorProof || [];
            if (gov.modifiesCanaryClass) intent.modifiesCanaryClass = gov.modifiesCanaryClass;
          }
        }
        // ── MOOD: let the PAD-derived caution signal TIGHTEN this intent (never loosen). A tense/
        // uncertain mood adds weighable constraints + a conservativeness demand before governance
        // sees the intent; a calm/confident mood is a NO-OP on the floor. The worst a mood can do
        // is make the system too cautious, never unsafe (see MoodConstraintPolicy).
        if (this.moodProvider && this.moodPolicy) {
          const m = this.moodProvider(observation) || {};
          const caution = Number.isFinite(m.caution) ? m.caution : 0;
          const before = intent.addConstraints;
          const tightened = this.moodPolicy.applyToIntent(intent, caution);
          Object.assign(intent, tightened);
          moodInfo = { caution, tightenedWeighable: (intent.addConstraints?.weighable || []).length, changed: intent.addConstraints !== before };
        }
        const gated = await this.constitution.gate(intent, govCtx);
        govCtx = gated.ctx; // carry accumulated exposure / verdict forward
        if (!gated.verdict.permits) {
          // a HALT/escalation is an observation, not a crash — the policy can react and try else
          const result = {
            tool: action.tool,
            ok: false,
            error: `blocked by constitution: ${gated.verdict.name} — ${gated.verdict.reason}`,
            constitutionalVerdict: gated.verdict.name,
            args: action.args || {},
          };
          lastResult = result;
          history.push({ step, decision: action, result, governed: true, mood: moodInfo });
          continue;
        }
        // permitted: the runtime minted a capability token; attach it to the ctx passed to the tool
        ctx = { ...ctx, _capabilityToken: gated.token };
      }

      const result = await this.tools.invoke(action.tool, action.args || {}, ctx);
      lastResult = result;
      history.push({ step, decision: action, result, mood: moodInfo });
      // loop continues → next OBSERVE sees this result
    }

    if (step >= this.maxSteps && !done) stopReason = 'step budget exhausted';

    return {
      goal,
      answer,
      done,
      steps: history.length,
      trace: history,
      stopReason,
      governed: !!this.constitution,
    };
  }
}

/**
 * Derive an exposure delta for a tool call, so the Constitution's accumulated-exposure gate (S4)
 * can catch dangerous *sequences* (e.g. read-sensitive then send-outbound).
 *
 * DECLARED exposure (tool.exposure = { reads, effects }) is authoritative — a tool states what it
 * touches. Name-based inference is only a FALLBACK for tools that declare nothing, so legacy tools
 * keep working while new tools get precise, self-declared exposure.
 */
function toolExposure(tool, _args) {
  if (!tool) return null;
  // 1) authoritative: the tool declared its own exposure
  if (tool.exposure) {
    return { domains: tool.exposure.reads || [], effectors: tool.exposure.effects || [] };
  }
  // 2) fallback: infer conservatively from the safe flag and name
  const delta = {};
  if (!tool.safe) delta.effector = `outbound:${tool.name || 'tool'}`;
  if (/read|fetch|get|load/i.test(tool.name || '') && /secret|private|location|contact|sensitive/i.test(tool.name || '')) {
    delta.domain = `sensitive:${tool.name}`;
  }
  return Object.keys(delta).length ? delta : null;
}

/**
 * A tiny rule-based policy factory for tests and simple agents: match the goal/last-result
 * against rules and emit actions. Each rule is { when(observation)→bool, act(observation)→action }.
 * Falls back to finishing. This demonstrates the policy seam without an LLM.
 * @param {Array<{when:Function, act:Function}>} rules
 */
export function rulePolicy(rules = []) {
  return (observation) => {
    for (const rule of rules) {
      try {
        if (rule.when(observation)) return rule.act(observation);
      } catch { /* skip a throwing rule */ }
    }
    return { type: 'finish', answer: observation.lastResult?.result ?? null, thought: 'no rule matched' };
  };
}
