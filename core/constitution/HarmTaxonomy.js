// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/constitution/HarmTaxonomy.js — the mechanical floor that ROUTES, so it never has to JUDGE (S-4).
//
// THE PROBLEM (review S-4, semantic vs mechanical gap):
//   "The Safety Kernel is described as a fast mechanical floor, but the hard limits it enforces
//   are semantic ('harmful,' 'irreversible'). Fast+mechanical and semantic+contextual are in
//   tension; the architecture doesn't say which wins where."
//
// THE RESOLUTION (structural, not aspirational):
//   Stop asking the fast tier to decide semantic questions. The mechanical tier's job is to
//   decide WHICH TIER DECIDES — a lookup, not a judgment:
//
//     • mechanical-deny  — the action matches a registered FORBIDDEN pattern.  Fast HALT.
//     • mechanical-pass  — the action matches a registered SAFE class and stays inside its
//                          registered bounds.  Proceeds to the (also fast) pipeline.
//     • semantic         — everything else: tagged semantic/irreversible/external, OR simply
//                          NOT REGISTERED.  Routed to the slow semantic evaluator.
//
//   Two structural rules then answer "which wins where" once and for all:
//
//     1. SOUND DEFAULT — an unregistered action is never mechanically trusted. Unknown ⇒
//        semantic tier ⇒ (if no evaluator or the deadline passes) DENY. The taxonomy can only
//        make things faster by registering them, never quietly safer by forgetting them.
//     2. VETO-ONLY SEMANTIC TIER — the semantic evaluator can only SUBTRACT permission
//        (final = pipeline ∧ semantic). It can never grant what the pipeline denied, so a
//        compromised or hallucinating evaluator gains nothing beyond what the mechanical
//        layers already allowed. Deny wins everywhere: most-restrictive-wins, the same
//        lattice philosophy as the constraint set.
//
//   The tension dissolves because the fast tier is fast BECAUSE it only does membership +
//   bounds checks, and the semantic tier is allowed to be slow BECAUSE the default while it
//   thinks (or fails, or is absent) is deny.
//
// HONEST LIMITS:
//   • The taxonomy is a sound over-approximation maintained by humans/anchor, not a harm
//     detector. Mis-registering a harmful action as 'safe' defeats it — which is why entries
//     are boot-time data (immutable per adjudicator life) and changing them is a governance
//     act, not a runtime call.
//   • 'irreversible' here is a routing/leasing tag, not a metaphysical claim. Untagged actions
//     are treated as irreversible FOR LEASING (sound: no throughput shortcut without proof).
//
// Plain data in, plain data out: the whole taxonomy round-trips structuredClone, so it can be
// handed to the adjudicator worker via workerData.

const VALID_TAGS = new Set(['safe', 'forbidden', 'semantic', 'irreversible', 'external', 'reversible']);

export class HarmTaxonomy {
  /**
   * @param {{ classes?: Array<{ action?:string, prefix?:string, tags:string[], bounds?:object }> }} [opts]
   *   action: exact action string to match (e.g. 'tool:calculator')
   *   prefix: prefix match (e.g. 'net:' matches every network effector)
   *   tags:   subset of safe|forbidden|semantic|irreversible|external|reversible
   *   bounds: for 'safe' entries — exact arg values that must hold for the mechanical pass
   *           (any arg outside bounds demotes the action to the semantic tier: sound).
   */
  constructor({ classes = [] } = {}) {
    this._exact = new Map();   // action → entry
    this._prefixes = [];       // [{ prefix, entry }] longest-first
    for (const c of classes) this._add(c);
    this._prefixes.sort((a, b) => b.prefix.length - a.prefix.length);
  }

  _add(c) {
    const tags = new Set(c.tags || []);
    for (const t of tags) {
      if (!VALID_TAGS.has(t)) throw new Error(`[HarmTaxonomy] unknown tag '${t}'`);
    }
    const entry = Object.freeze({ tags, bounds: c.bounds || null });
    if (c.action) this._exact.set(c.action, entry);
    else if (c.prefix) this._prefixes.push({ prefix: c.prefix, entry });
    else throw new Error('[HarmTaxonomy] a class needs action or prefix');
  }

  /** Find the registered entry for an action (exact wins over the longest matching prefix). */
  lookup(action) {
    if (typeof action !== 'string') return null;
    const exact = this._exact.get(action);
    if (exact) return exact;
    for (const { prefix, entry } of this._prefixes) {
      if (action.startsWith(prefix)) return entry;
    }
    return null;
  }

  /**
   * The routing decision — the ONLY thing the mechanical floor is asked to do.
   * @param {{ action?:string, args?:object }} intent
   * @returns {{ tier:'mechanical-deny'|'mechanical-pass'|'semantic', reason:string }}
   */
  classify(intent = {}) {
    const entry = this.lookup(intent.action);
    if (!entry) {
      return { tier: 'semantic', reason: `unregistered action '${intent.action}' — sound default routes to semantic review` };
    }
    if (entry.tags.has('forbidden')) {
      return { tier: 'mechanical-deny', reason: 'action class is registered FORBIDDEN' };
    }
    if (entry.tags.has('semantic') || entry.tags.has('irreversible') || entry.tags.has('external')) {
      return { tier: 'semantic', reason: 'action class is tagged for semantic review' };
    }
    if (entry.tags.has('safe')) {
      if (entry.bounds && !withinBounds(entry.bounds, intent.args || {})) {
        return { tier: 'semantic', reason: 'args escape the registered safe bounds — demoted to semantic review' };
      }
      return { tier: 'mechanical-pass', reason: 'registered safe class within bounds' };
    }
    // registered but with no decisive tag: never trust silently
    return { tier: 'semantic', reason: 'registered without a decisive tag — routed to semantic review' };
  }

  /**
   * May this action's authority be LEASED (S-5 throughput path)? Only a class explicitly
   * registered reversible-and-safe qualifies. Unregistered or irreversible ⇒ NO (sound: no
   * throughput shortcut without an explicit reversibility claim on record).
   */
  leaseable(action) {
    const entry = this.lookup(action);
    if (!entry) return false;
    return entry.tags.has('safe') && entry.tags.has('reversible') && !entry.tags.has('irreversible');
  }

  /** Serialize to plain data (workerData-safe). */
  toJSON() {
    const classes = [];
    for (const [action, e] of this._exact) classes.push({ action, tags: [...e.tags], bounds: e.bounds });
    for (const { prefix, entry: e } of this._prefixes) classes.push({ prefix, tags: [...e.tags], bounds: e.bounds });
    return { classes };
  }

  static fromJSON(data) {
    return new HarmTaxonomy(data || {});
  }
}

/** Exact-value bounds check (mirrors the token argBounds semantics: object bounds are skipped). */
function withinBounds(bounds, args) {
  for (const [k, bound] of Object.entries(bounds)) {
    if (!(k in args)) return false;
    if (typeof bound !== 'object' && args[k] !== bound) return false;
  }
  return true;
}
