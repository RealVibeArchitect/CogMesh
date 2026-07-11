// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang).
// Dual-licensed: GNU AGPL-3.0-or-later (see /LICENSE) OR a commercial license
// (see /COMMERCIAL-LICENSE.md). The PAD formulae, coordinate values, and algorithms
// herein are original works of the author (see the CogMesh Technical Whitepaper).
// This program is free software: redistribute/modify under the AGPL; it comes with
// NO WARRANTY. If you run a modified version over a network, the AGPL requires you to
// offer its complete source to users.

// core/memory/WorkingMemory.js
// Working Memory — short-term working memory
//
// Keeps the "immediately preceding context" of the conversation being processed.
// Small capacity, recency-focused (holds only a few items, like human working memory).

const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class WorkingMemory {
  /** @param {{ capacity?: number }} [opts] default 8 turns (short context) */
  constructor(opts = {}) {
    this.capacity = clampInt(opts.capacity ?? 8, 1, 100);
    this._turns = [];
  }

  push(turn) {
    if (!turn?.text) return null;
    const entry = { ...turn, t: Date.now() };
    this._turns.push(entry);
    if (this._turns.length > this.capacity) {
      this._turns.splice(0, this._turns.length - this.capacity);
    }
    return entry;
  }

  /** the full current working context (most recent last) */
  context() {
    return [...this._turns];
  }

  clear() {
    this._turns = [];
  }
}
