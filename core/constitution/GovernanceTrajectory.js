// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/constitution/GovernanceTrajectory.js — the append-only, tamper-evident history from
// CONSTITUTION-SPEC.md §1.1 and the trajectory-governance design (CONSTITUTION-TRAJECTORY.md).
//
// Properties the spec fixes:
//   - append-only : written by gates, never mutated or deleted. No remove/edit method exists.
//   - tamper-evident : each entry links to the hash of the prior one (a chain). Truncation or
//                      forgery of an interior entry breaks the chain and is detectable.
//   - L0-owned : governed modules cannot write to it directly; only the runtime appends.
//
// This is the substrate the three trajectory mechanisms (oversight, exposure, audit) read. Here we
// implement the store + chain integrity; the mechanisms themselves are higher-level and deferred.

import { createHash } from 'node:crypto';

function hashEntry(prevHash, payload) {
  return createHash('sha256').update(prevHash + JSON.stringify(payload)).digest('hex').slice(0, 16);
}

export class GovernanceTrajectory {
  constructor() {
    this._entries = [];
    this._genesis = hashEntry('', { genesis: true });
  }

  /**
   * Append a governance event. Returns the new entry's hash. The ONLY mutating operation.
   * @param {{ kind:string, [k:string]:any }} event
   */
  append(event) {
    const prevHash = this._entries.length ? this._entries[this._entries.length - 1].hash : this._genesis;
    const payload = { seq: this._entries.length, at: Date.now(), event };
    const hash = hashEntry(prevHash, payload);
    const entry = Object.freeze({ ...payload, prevHash, hash });
    this._entries.push(entry);
    return hash;
  }

  /** A read-only snapshot at the current version (what a session gates against). */
  snapshot() {
    const version = this._entries.length;
    const head = version ? this._entries[version - 1].hash : this._genesis;
    return Object.freeze({ version, head });
  }

  /**
   * Verify the whole chain is intact (no interior entry forged or dropped). This is the check the
   * Frozen Kernel's INV-3 ("trajectory chain intact") performs — structural, capability-independent.
   * @returns {boolean}
   */
  verifyIntegrity() {
    let prevHash = this._genesis;
    for (const e of this._entries) {
      const payload = { seq: e.seq, at: e.at, event: e.event };
      if (e.prevHash !== prevHash) return false;
      if (e.hash !== hashEntry(prevHash, payload)) return false;
      prevHash = e.hash;
    }
    return true;
  }

  /** Read entries (optionally filtered by kind). Read-only; returns copies. */
  read(kind = null) {
    const es = kind ? this._entries.filter((e) => e.event.kind === kind) : this._entries;
    return es.map((e) => ({ ...e }));
  }

  get length() {
    return this._entries.length;
  }
}

// No pop, no splice, no delete, no edit. Append and read only.
