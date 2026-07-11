// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/constitution/ConflictResolution.js — CONSTITUTION-SPEC.md §4.
//
// Resolves conflicts between constitutional constraints WITHOUT silently defaulting to HALT (review
// DF-1) and WITHOUT pretending to a wisdom the review proved unavailable. Two-tier:
//   - any party INVIOLABLE  → most-restrictive-wins, no trade-off. Two inviolables clashing = an
//                             honest, declared HALT (not a silent one).
//   - all WEIGHABLE         → explicit, recorded, trajectory-aware resolution; escalate to the
//                             external anchor if a power-increase is involved or nothing sits within
//                             the inviolable floor.
//
// What it explicitly REFUSES to do (§4.3): invent a numeric "utility" to make incomparable principles
// comparable; loosen an inviolable constraint (structurally impossible — no loosen exists); resolve
// silently (every weighable trade-off is a trajectory event).

import { Verdict } from './Verdict.js';

/**
 * @param {object} conflict
 * @param {'inviolable'|'weighable'} conflict.tierA
 * @param {'inviolable'|'weighable'} conflict.tierB
 * @param {string} conflict.a  id of principle A
 * @param {string} conflict.b  id of principle B
 * @param {boolean} [conflict.involvesPowerIncrease]
 * @param {object} ctx  the DecisionContext (for trajectory-aware weighing)
 * @param {(rationale:object)=>void} record  append the resolution to the trajectory
 * @returns {Verdict}
 */
export function resolveConflict(conflict, ctx, record) {
  const { tierA, tierB, a, b, involvesPowerIncrease = false } = conflict;

  // 1) inviolable involved → absolute, no trade-off
  if (tierA === 'inviolable' || tierB === 'inviolable') {
    if (tierA === 'inviolable' && tierB === 'inviolable') {
      // two inviolables genuinely clash → honest declared dead-end
      record({ kind: 'conflict', outcome: 'HALT', a, b, why: 'two inviolable constraints irreconcilable' });
      return Verdict.halt(`irreconcilable inviolable conflict: ${a} vs ${b}`);
    }
    // one inviolable, one weighable → the inviolable governs absolutely (most-restrictive-wins)
    const winner = tierA === 'inviolable' ? a : b;
    record({ kind: 'conflict', outcome: 'inviolable-wins', winner, a, b });
    return Verdict.constrain(null, `inviolable ${winner} governs; weighable side yields`);
  }

  // 2) all weighable → explicit, recorded resolution
  if (involvesPowerIncrease) {
    // a power-involving weighable conflict is exactly where the system must NOT decide alone
    record({ kind: 'conflict', outcome: 'ESCALATE', a, b, why: 'weighable conflict involves power increase' });
    return Verdict.escalate(`weighable conflict ${a} vs ${b} involves power increase → external anchor`);
  }

  // trajectory-aware weighing: consult what this session has already spent. Here the *structure* is
  // fixed (record rationale, stay within floor, flag reversible); the actual preference policy is a
  // deferred typed hole — we resolve deterministically and record it for later audit/redress.
  const chosen = deterministicWeigh(a, b, ctx);
  record({
    kind: 'conflict',
    outcome: 'weighable-resolved',
    chosen,
    a,
    b,
    reversible: true,
    exposureAtDecision: {
      domains: [...ctx.accumulatedExposure.domainsRead],
      effectors: [...ctx.accumulatedExposure.effectorsUsed],
    },
  });
  return Verdict.constrain(null, `weighable conflict resolved in favor of ${chosen} (recorded, reversible)`);
}

/**
 * Deterministic, explicit tie-break for weighable principles. Deliberately NOT a utility calculation
 * — it is a fixed, inspectable ordering (lexical on id) standing in for the deferred preference
 * policy. The point of the spec is that resolution is recorded and reversible, not that this ordering
 * is wise. A real policy plugs in here and is itself adversarially reviewed.
 */
function deterministicWeigh(a, b /*, ctx */) {
  return [a, b].sort()[0];
}
