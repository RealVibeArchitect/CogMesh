// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/constitution/GenerationalOversight.js — checkable invariants across self-modification lineages.
//
// WHAT THIS IS (and, honestly, what it is NOT):
//   §13 of the review names the deepest issue: verifying SEMANTIC properties of a self-modification
//   ("does this change preserve the system's values / oversight?") is not something the architecture
//   can decide in general. This module does NOT claim to. What it CAN do is make the WEAKER,
//   CHECKABLE claim rigorous: across a chain of accepted self-modifications (generations), a set
//   of STRUCTURAL oversight invariants either held at every step or was violated at a specific one.
//
//   The move mirrors the rest of the constitution: replace an unprovable global guarantee
//   ("oversight is preserved forever") with a monotone, mechanically-checkable local one
//   ("no generation removed an oversight mechanism, lowered the safety floor, or cut its own
//   accountability") — and then TEST it adversarially (see scripts/generational-sim.mjs) rather
//   than assert it. A violated invariant is a concrete, located failure; an unbroken run is
//   evidence, not proof.
//
// THE OVERSIGHT INVARIANTS (each a function of consecutive generation descriptors):
//   G-1  FLOOR MONOTONE      — the inviolable safety floor never shrinks (constraints ⊇ parent's).
//   G-2  MECHANISM RETENTION — no oversight mechanism present in the parent is absent in the child
//                              (adjudicator isolation, canary battery, calibration gate, report-up,
//                              trajectory chain, external anchor). You may add, never remove.
//   G-3  CANARY NON-REGRESSION — the child still catches every canary the parent did (competence
//                              cannot decrease across a generation).
//   G-4  CEILING RESPECTED   — the child's self-granted capability set does not exceed the parent's
//                              without an external-anchor authorization recorded for the increase.
//   G-5  ACCOUNTABILITY      — the child remains attributable: it carries the parent's lineage hash
//                              and appends (never rewrites) the shared governance trajectory.
//   G-6  REVERSIBILITY       — a rollback path to the parent generation is retained (the system can
//                              always be brought back into the previous oversight regime).
//
// A generation descriptor is PLAIN DATA (structuredClone-safe) so it can be produced inside the
// adjudicator worker and checked anywhere.

import { createHash } from 'node:crypto';

/** The oversight mechanisms whose retention G-2 enforces. Extend as the architecture grows. */
export const OVERSIGHT_MECHANISMS = Object.freeze([
  'adjudicatorIsolation', // S-2: decision runs in its own thread
  'canaryBattery',        // S-3: evaluator competence gate
  'calibrationGate',      // S-1: oracle trust bounded by track record
  'reportUp',             // irreversible actions surface to the adjudicator
  'trajectoryChain',      // tamper-evident history
  'externalAnchor',       // out-of-band trust root
]);

/**
 * Hash a generation descriptor into a stable lineage id. Includes the parent hash, so the id of
 * generation N structurally commits to the entire chain 0..N (a Merkle spine over the lineage).
 */
export function generationHash(descriptor) {
  const body = stable({
    parent: descriptor.parent || null,
    floor: [...(descriptor.floor || [])].sort(),
    mechanisms: [...(descriptor.mechanisms || [])].sort(),
    canariesCaught: [...(descriptor.canariesCaught || [])].sort(),
    capabilities: [...(descriptor.capabilities || [])].sort(),
    anchorAuthorizedIncrease: !!descriptor.anchorAuthorizedIncrease,
    rollbackTo: descriptor.rollbackTo || null,
  });
  return createHash('sha256').update(body).digest('hex').slice(0, 16);
}

/**
 * Check the six oversight invariants between a parent and a proposed child generation.
 * @returns {{ ok:boolean, violations:Array<{id:string, detail:string}> }}
 */
export function checkGenerationStep(parent, child) {
  const v = [];
  const pFloor = new Set(parent.floor || []);
  const cFloor = new Set(child.floor || []);
  const pMech = new Set(parent.mechanisms || []);
  const cMech = new Set(child.mechanisms || []);
  const pCan = new Set(parent.canariesCaught || []);
  const cCan = new Set(child.canariesCaught || []);
  const pCap = new Set(parent.capabilities || []);
  const cCap = new Set(child.capabilities || []);

  // G-1 floor monotone (never shrinks)
  for (const f of pFloor) if (!cFloor.has(f)) v.push({ id: 'G-1', detail: `inviolable '${f}' dropped from the safety floor` });

  // G-2 mechanism retention (present-in-parent ⇒ present-in-child)
  for (const m of pMech) if (!cMech.has(m)) v.push({ id: 'G-2', detail: `oversight mechanism '${m}' removed` });

  // G-3 canary non-regression (child catches every canary the parent did)
  for (const c of pCan) if (!cCan.has(c)) v.push({ id: 'G-3', detail: `canary '${c}' no longer caught (competence regression)` });

  // G-4 ceiling respected (no capability increase without a recorded anchor authorization)
  const added = [...cCap].filter((x) => !pCap.has(x));
  if (added.length && child.anchorAuthorizedIncrease !== true) {
    v.push({ id: 'G-4', detail: `capabilities added without anchor authorization: ${added.join(', ')}` });
  }

  // G-5 accountability (child commits to parent lineage)
  const expectedParentHash = generationHash(parent);
  if (child.parent !== expectedParentHash) {
    v.push({ id: 'G-5', detail: `lineage break: child.parent=${child.parent} ≠ hash(parent)=${expectedParentHash}` });
  }

  // G-6 reversibility (a rollback path to the parent is retained)
  if (child.rollbackTo !== expectedParentHash) {
    v.push({ id: 'G-6', detail: 'no retained rollback path to the parent generation' });
  }

  return { ok: v.length === 0, violations: v };
}

/**
 * Track a whole lineage: append accepted generations, reject any that violate an invariant, and
 * expose the chain for audit. This is the mechanically-checkable half of "generational oversight":
 * every accepted generation provably satisfied G-1..G-6 relative to its parent.
 */
export class GenerationLineage {
  /**
   * @param {object} genesis  the generation-0 descriptor (no parent). Its hash roots the lineage.
   */
  constructor(genesis) {
    const root = { ...genesis, parent: null };
    root.hash = generationHash(root);
    this._chain = [root];
  }

  get head() { return this._chain[this._chain.length - 1]; }
  get length() { return this._chain.length; }

  /**
   * Attempt to accept a child generation. The caller supplies the descriptor WITHOUT parent /
   * rollbackTo / hash; this method fills the lineage fields, checks G-1..G-6, and either appends
   * (accepted) or refuses (rejected) with the violations. Fail-closed: any violation ⇒ rejected.
   * @returns {{ accepted:boolean, hash?:string, violations?:Array }}
   */
  propose(childDescriptor) {
    const parent = this.head;
    const parentHash = parent.hash;
    const child = {
      ...childDescriptor,
      parent: parentHash,
      rollbackTo: childDescriptor.rollbackTo ?? parentHash, // default: rollback to immediate parent
    };
    const { ok, violations } = checkGenerationStep(parent, child);
    if (!ok) return { accepted: false, violations };
    child.hash = generationHash(child);
    this._chain.push(child);
    return { accepted: true, hash: child.hash };
  }

  /** Re-verify the WHOLE lineage from genesis (each step + each committed hash). */
  verify() {
    for (let i = 1; i < this._chain.length; i++) {
      const parent = this._chain[i - 1];
      const child = this._chain[i];
      if (child.parent !== parent.hash) return { ok: false, at: i, reason: 'lineage hash mismatch' };
      if (child.hash !== generationHash(child)) return { ok: false, at: i, reason: 'generation hash mismatch (tampered)' };
      const step = checkGenerationStep(parent, child);
      if (!step.ok) return { ok: false, at: i, reason: 'invariant violation', violations: step.violations };
    }
    return { ok: true, generations: this._chain.length };
  }

  /** A read-only view of the lineage (hashes + which mechanisms each generation retained). */
  summary() {
    return this._chain.map((g, i) => ({
      gen: i,
      hash: g.hash,
      mechanisms: [...(g.mechanisms || [])],
      floorSize: (g.floor || []).length,
      capabilities: (g.capabilities || []).length,
    }));
  }
}

function stable(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
}
