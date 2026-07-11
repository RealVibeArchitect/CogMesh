// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang).
// Dual-licensed: GNU AGPL-3.0-or-later (see /LICENSE) OR a commercial license
// (see /COMMERCIAL-LICENSE.md). The PAD formulae, coordinate values, and algorithms
// herein are original works of the author (see the CogMesh Technical Whitepaper).
// This program is free software: redistribute/modify under the AGPL; it comes with
// NO WARRANTY. If you run a modified version over a network, the AGPL requires you to
// offer its complete source to users.

// core/memory/ReflectionMemory.js
// Reflection Memory — reflective memory
//
// Remembers what the system has observed about itself.
// e.g. past reasoning stances, moments of self-braking (asking back), emergent emotions.
// This lets it look back on "what state was I just in?" (persistence of metacognition).

const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class ReflectionMemory {
  /** @param {{ capacity?: number }} [opts] */
  constructor(opts = {}) {
    this.capacity = clampInt(opts.capacity ?? 100, 1, 10000);
    this._log = [];
  }

  /**
   * Record a reflection entry.
   * @param {{ stance?: string, emerged?: boolean, held?: boolean, note?: string, params?: object }} reflection
   */
  record(reflection = {}) {
    const entry = { ...reflection, t: Date.now() };
    this._log.push(entry);
    if (this._log.length > this.capacity) {
      this._log.splice(0, this._log.length - this.capacity);
    }
    return entry;
  }

  /** the most recent reflection entry */
  last() {
    return this._log[this._log.length - 1] ?? null;
  }

  /** the most recent n entries */
  recent(n = 10) {
    return this._log.slice(-Math.max(1, n));
  }

  /** only entries where self-braking (held) occurred */
  heldMoments() {
    return this._log.filter((e) => e.held);
  }

  clear() {
    this._log = [];
  }
}
