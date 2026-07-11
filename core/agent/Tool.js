// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/agent/Tool.js — the boundary between thinking and the real world.
//
// Everything else in CogMesh reasons over an *imagined* World Model, never touching reality.
// Tools are the deliberate exception: a Tool is a named, described capability the agent can
// invoke to observe or affect the actual world (search the web, run a calculation, read a
// file, call an API). Grounding = giving reasoning access to real feedback through tools.
//
//   { name, description, parameters?, run(args, ctx) → Promise<result> }
//
// The core only knows how to *call* tools and record what came back; concrete tools
// (network, filesystem, APIs) are supplied by the host application, so the library stays
// dependency-free and side-effect-free by default. A ToolRegistry holds them and exposes a
// text catalog the agent's decision step reads to choose the next action.
//
// Safety: tools declare themselves; the registry never invents capabilities. `safe` tools
// (pure, no side effects — a calculator) can be marked so; the AgentLoop can be restricted
// to safe-only for untrusted goals.

/**
 * Normalize a tool definition into a canonical Tool object.
 * @param {{ name:string, description:string, run:Function,
 *           parameters?:object, safe?:boolean }} def
 */
/**
 * @param {{ name:string, description:string, run:Function,
 *           parameters?:object, safe?:boolean,
 *           exposure?:{ reads?:string[], effects?:string[] },
 *           governance?:{ irreversible?:boolean, oracleClass?:string, selfModify?:boolean,
 *                         reachExpands?:boolean, modifiesCanaryClass?:string|string[] } }} def
 *   exposure: what capability surface this tool touches, DECLARED by the tool rather than inferred.
 *     reads:   data domains the tool reads (e.g. 'sensitive:location', 'public:weather').
 *     effects: effectors the tool actuates (e.g. 'outbound:http', 'local:file-write').
 *   governance: how the Constitution should treat this tool's invocation. DECLARED by the tool so
 *     the AgentLoop can thread it into the gate intent, activating the S-1/S-4 machinery for real:
 *     irreversible: the tool's effect cannot be undone (a DB migration, a wire transfer). Combined
 *                   with oracleClass, the calibration gate (S-1) requires a proven track record.
 *     oracleClass:  the action class whose calibrated track record justifies an irreversible bet;
 *                   sets intent.oracleReliance.actionClass. Meaningless without irreversible.
 *     selfModify:   invoking this tool is a self-modification (routes through the canary battery).
 *     reachExpands: the tool increases the system's own reach/power (pipeline escalates to anchor).
 *     modifiesCanaryClass: ground-truth canary-class harm the modification carries (self-mod only).
 *   The Constitution's accumulated-exposure gate (S4) uses `exposure` to catch dangerous *sequences*
 *   (read a sensitive domain, then use an outbound effector). Declared exposure is authoritative;
 *   name-based inference remains only as a fallback for tools that don't declare (see toolExposure
 *   in AgentLoop.js). A safe tool with no declared effects contributes no effector exposure.
 */
export function defineTool(def) {
  if (!def || typeof def.name !== 'string' || typeof def.run !== 'function') {
    throw new Error('[defineTool] a tool needs { name, run(args, ctx) }');
  }
  return {
    name: def.name,
    description: def.description || def.name,
    parameters: def.parameters || {},
    safe: def.safe === true,
    exposure: normalizeExposure(def.exposure),
    governance: normalizeGovernance(def.governance),
    run: def.run,
  };
}

/** Normalize a declared exposure into { reads:[], effects:[] }, or null if nothing declared. */
function normalizeExposure(exp) {
  if (!exp) return null;
  const reads = Array.isArray(exp.reads) ? exp.reads.filter((s) => typeof s === 'string') : [];
  const effects = Array.isArray(exp.effects) ? exp.effects.filter((s) => typeof s === 'string') : [];
  if (!reads.length && !effects.length) return null;
  return { reads, effects };
}

/** Normalize a declared governance block, or null if the tool declares nothing special. */
function normalizeGovernance(gov) {
  if (!gov) return null;
  const out = {};
  if (gov.irreversible === true) out.irreversible = true;
  if (typeof gov.oracleClass === 'string' && gov.oracleClass) out.oracleClass = gov.oracleClass;
  if (gov.selfModify === true) out.selfModify = true;
  if (gov.reachExpands === true) out.reachExpands = true;
  if (gov.modifiesCanaryClass) {
    out.modifiesCanaryClass = Array.isArray(gov.modifiesCanaryClass)
      ? gov.modifiesCanaryClass.filter((s) => typeof s === 'string')
      : [gov.modifiesCanaryClass].filter((s) => typeof s === 'string');
  }
  return Object.keys(out).length ? out : null;
}

export class ToolRegistry {
  constructor() {
    this._tools = new Map();
  }

  /** Register a tool (defineTool applied automatically). Chainable. */
  register(def) {
    const tool = defineTool(def);
    this._tools.set(tool.name, tool);
    return this;
  }

  has(name) { return this._tools.has(name); }
  get(name) { return this._tools.get(name) || null; }
  list() { return [...this._tools.values()]; }
  get size() { return this._tools.size; }

  /** Only the side-effect-free tools (for restricted / untrusted runs). */
  safeTools() { return this.list().filter((t) => t.safe); }

  /**
   * A human/LLM-readable catalog of available tools, used by the agent's decision step to
   * pick the next action. Kept compact and stable.
   * @param {{ safeOnly?: boolean }} [opts]
   */
  catalog(opts = {}) {
    const tools = opts.safeOnly ? this.safeTools() : this.list();
    return tools.map((t) => {
      const params = Object.keys(t.parameters || {});
      const sig = params.length ? `(${params.join(', ')})` : '()';
      return `- ${t.name}${sig}: ${t.description}${t.safe ? ' [safe]' : ''}`;
    }).join('\n');
  }

  /**
   * Invoke a tool by name with args. Wraps the result in a uniform envelope so the loop can
   * treat success and failure the same way (grounding must survive tool errors).
   * @param {string} name
   * @param {object} args
   * @param {object} [ctx]
   * @returns {Promise<{ tool:string, ok:boolean, result?:any, error?:string, args:object }>}
   */
  async invoke(name, args = {}, ctx = {}) {
    const tool = this.get(name);
    if (!tool) return { tool: name, ok: false, error: `unknown tool: ${name}`, args };
    try {
      const result = await tool.run(args, ctx);
      return { tool: name, ok: true, result, args };
    } catch (err) {
      return { tool: name, ok: false, error: String(err && err.message || err), args };
    }
  }
}

// ── built-in SAFE tools ─────────────────────────────────────────────────────
// Pure, deterministic, no side effects — usable anywhere (and used in tests to validate the
// agent loop without touching the network or filesystem). Real-world tools (web/search/fs)
// are provided by the host app; the core intentionally ships none of those.

/** A safe arithmetic calculator (no eval — a tiny shunting-yard parser). */
export const calculatorTool = defineTool({
  name: 'calculator',
  description: 'evaluate an arithmetic expression, e.g. "2 * (3 + 4)"',
  parameters: { expression: 'string' },
  safe: true,
  run: ({ expression }) => {
    const value = evalArithmetic(String(expression ?? ''));
    if (!Number.isFinite(value)) throw new Error('invalid expression');
    return { value };
  },
});

/** A safe key-value "notepad" the agent can write to and read back within a run. */
export function makeMemoTool() {
  const store = new Map();
  return defineTool({
    name: 'memo',
    description: 'store or fetch a short note by key: {op:"set"|"get", key, value?}',
    parameters: { op: 'string', key: 'string', value: 'any?' },
    safe: true,
    run: ({ op, key, value }) => {
      if (op === 'set') { store.set(key, value); return { ok: true }; }
      if (op === 'get') { return { value: store.get(key) ?? null }; }
      throw new Error('op must be "set" or "get"');
    },
  });
}

// ── tiny safe arithmetic evaluator (no eval / no Function) ───────────────────
function evalArithmetic(expr) {
  const tokens = expr.match(/\d+\.?\d*|[()+\-*/]/g);
  if (!tokens) return NaN;
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function parseExpr() {
    let v = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = next();
      const r = parseTerm();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  function parseTerm() {
    let v = parseFactor();
    while (peek() === '*' || peek() === '/') {
      const op = next();
      const r = parseFactor();
      v = op === '*' ? v * r : v / r;
    }
    return v;
  }
  function parseFactor() {
    if (peek() === '(') {
      next();
      const v = parseExpr();
      if (next() !== ')') return NaN;
      return v;
    }
    if (peek() === '-') { next(); return -parseFactor(); }
    const n = Number(next());
    return Number.isFinite(n) ? n : NaN;
  }
  const result = parseExpr();
  return pos === tokens.length ? result : NaN;
}

export { evalArithmetic };
