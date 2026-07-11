// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang).
// Dual-licensed: GNU AGPL-3.0-or-later (see /LICENSE) OR a commercial license
// (see /COMMERCIAL-LICENSE.md). The PAD formulae, coordinate values, and algorithms
// herein are original works of the author (see the CogMesh Technical Whitepaper).
// This program is free software: redistribute/modify under the AGPL; it comes with
// NO WARRANTY. If you run a modified version over a network, the AGPL requires you to
// offer its complete source to users.

// src/core/pad/padState.js
// CogMesh Sprint 11 — PAD Dynamic (EMA-based emotion state tracker)
//
// CogMesh v1.0 spec item 4:
//   S_t = (S_{t-1} · λ) + (Δv · α)
//   λ = Emotion Persistence, α = Sensitivity
//   Stability constraint: λ + α ≤ 1, always S_t ∈ [-1, 1]
//
// Side effect (Document 03 "smooth transition" requirement):
//   Because it is EMA, a single input cannot change the coordinate abruptly.
//   i.e. it cannot jump from near 'anger' to 'elation' in one step;
//   it moves naturally through intermediate points (e.g. toward serene/relieved) —
//   the EMA itself plays that role, with no separate "force intermediate step" logic.

import { nearestEmotion } from './nearestEmotion.js';

const clamp = (v) => Math.max(-1, Math.min(1, v));

export class PADState {
  /**
   * @param {{ lambda?: number, alpha?: number, initial?: {p:number,a:number,d:number} }} [opts]
   */
  constructor(opts = {}) {
    const { lambda = 0.7, alpha = 0.3, initial = { p: 0, a: 0, d: 0 } } = opts;

    if (lambda + alpha > 1) {
      throw new Error(
        `[PADState] Stability violation: λ(${lambda}) + α(${alpha}) > 1. Violates spec item 4.`
      );
    }

    this.lambda = lambda;
    this.alpha = alpha;
    this.coord = { p: clamp(initial.p), a: clamp(initial.a), d: clamp(initial.d) };
    this.history = [{ ...this.coord, t: 0 }];
  }

  /**
   * Advance the state one step by incorporating a new input emotion (Δv).
   * @param {{p:number,a:number,d:number}} deltaV - PAD coordinate of the input event
   * @returns {{p:number,a:number,d:number}} the updated coordinate
   */
  update(deltaV) {
    const next = {
      p: clamp(this.coord.p * this.lambda + deltaV.p * this.alpha),
      a: clamp(this.coord.a * this.lambda + deltaV.a * this.alpha),
      d: clamp(this.coord.d * this.lambda + deltaV.d * this.alpha),
    };
    this.coord = next;
    this.history.push({ ...next, t: this.history.length });
    return next;
  }

  /** current PAD coordinate */
  getCoord() {
    return { ...this.coord };
  }

  /** nearest core emotion to the current coordinate (includes label, distance) */
  getCurrentEmotion() {
    return nearestEmotion(this.coord);
  }

  /** reset state (to origin) */
  reset(initial = { p: 0, a: 0, d: 0 }) {
    this.coord = { p: clamp(initial.p), a: clamp(initial.a), d: clamp(initial.d) };
    this.history = [{ ...this.coord, t: 0 }];
  }
}
