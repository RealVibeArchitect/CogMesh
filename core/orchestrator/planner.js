// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/orchestrator/planner.js — goal decomposition & multi-step execution.
//
// The mesh answers one prompt with one routed response. A Planner sits above that:
// it takes a *goal* and breaks it into an ordered list of steps, then (optionally)
// executes them through the mesh, feeding each step's result into the next.
//
//   "analyze Samsung stock"  →  [ gather data, analyze trend, assess risk, conclude ]
//
// This is a lightweight, dependency-free planner: it decomposes by matching the goal
// against a small library of task templates (finance / coding / research / generic).
// If you have an LLM, plug it in via `new Planner({ decomposer })` to get open-ended
// plans — the execution machinery is identical either way.

// ── built-in task templates: goal pattern → ordered step blueprints ────────
const TEMPLATES = [
  {
    id: 'finance',
    match: /stock|ticker|invest|주가|종목|주식|투자|금리|환율/i,
    steps: (goal) => [
      { action: 'gather',  intent: `gather market data for: ${goal}` },
      { action: 'analyze', intent: `analyze price/volume trend for: ${goal}` },
      { action: 'assess',  intent: `assess risks and uncertainties for: ${goal}` },
      { action: 'conclude', intent: `summarize a balanced view for: ${goal}` },
    ],
  },
  {
    id: 'coding',
    match: /code|bug|function|refactor|debug|버그|함수|리팩터|디버그/i,
    steps: (goal) => [
      { action: 'clarify', intent: `restate the requirement for: ${goal}` },
      { action: 'design',  intent: `outline an approach for: ${goal}` },
      { action: 'implement', intent: `write the code for: ${goal}` },
      { action: 'verify',  intent: `check edge cases and correctness for: ${goal}` },
    ],
  },
  {
    id: 'research',
    match: /research|compare|explain|why|how|analyze|조사|비교|설명|분석/i,
    steps: (goal) => [
      { action: 'scope',    intent: `define what to find out for: ${goal}` },
      { action: 'gather',   intent: `collect relevant facts for: ${goal}` },
      { action: 'synthesize', intent: `synthesize findings for: ${goal}` },
    ],
  },
];

// generic fallback when no template matches
const GENERIC = (goal) => [
  { action: 'understand', intent: `understand the goal: ${goal}` },
  { action: 'act',        intent: `produce a response for: ${goal}` },
];

export class Planner {
  /**
   * @param {{ decomposer?: function }} [opts]
   *   decomposer(goal) → step[] lets you swap the built-in templates for an LLM
   *   or any custom planner. Each step should be { action, intent }.
   */
  constructor(opts = {}) {
    this._decomposer = typeof opts.decomposer === 'function' ? opts.decomposer : null;
  }

  /** Break a goal into an ordered plan of steps. Never throws on bad input. */
  plan(goal) {
    const g = (goal ?? '').toString().trim();
    if (!g) return { goal: '', steps: [], strategy: 'empty' };

    if (this._decomposer) {
      const steps = this._decomposer(g) || [];
      return { goal: g, steps, strategy: 'custom' };
    }

    const tpl = TEMPLATES.find((t) => t.match.test(g));
    const steps = (tpl ? tpl.steps(g) : GENERIC(g)).map((s, i) => ({ ...s, index: i }));
    return { goal: g, steps, strategy: tpl ? tpl.id : 'generic' };
  }

  /**
   * Execute a plan step-by-step through a runner (usually mesh.route). Each step's
   * result is collected; a failing step is recorded but does NOT abort the plan
   * (graceful degradation), so you always get a full trace back.
   *
   * @param {string} goal
   * @param {(intent:string, step:object)=>Promise<any>} runner
   * @param {{ stopOnError?: boolean }} [opts]
   */
  async execute(goal, runner, opts = {}) {
    const plan = this.plan(goal);
    const results = [];
    for (const step of plan.steps) {
      try {
        const output = await runner(step.intent, step);
        results.push({ ...step, ok: true, output });
      } catch (err) {
        results.push({ ...step, ok: false, error: err?.message ?? String(err) });
        if (opts.stopOnError) break;
      }
    }
    return {
      goal: plan.goal,
      strategy: plan.strategy,
      steps: results,
      completed: results.filter((r) => r.ok).length,
      total: plan.steps.length,
    };
  }
}

export { TEMPLATES };
