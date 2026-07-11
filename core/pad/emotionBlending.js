// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang).
// Dual-licensed: GNU AGPL-3.0-or-later (see /LICENSE) OR a commercial license
// (see /COMMERCIAL-LICENSE.md). The PAD formulae, coordinate values, and algorithms
// herein are original works of the author (see the CogMesh Technical Whitepaper).
// This program is free software: redistribute/modify under the AGPL; it comes with
// NO WARRANTY. If you run a modified version over a network, the AGPL requires you to
// offer its complete source to users.

// src/core/pad/blend.js
// CogMesh Sprint 16 — PAD Level 1: Linear Vector Blend
//
// The most stable layer of the idea "emotions combine to create a new emotion."
//
// Takes several (emotion, weight) pairs and computes a weighted average in PAD space.
//   blended = Σ(wᵢ · coordᵢ) / Σwᵢ
//
// This is deterministic and predictable = the system's backbone.
// Level 2 (nonlinear emergence) takes this result as input and works on top of it.

import { EMOTION_BY_ID } from './emotionMap.js';
import { nearestEmotion } from './nearestEmotion.js';

const clamp = (v) => Math.max(-1, Math.min(1, v));

/**
 * Linearly blend several emotions by weight.
 * @param {Array<{ id?: string, coord?: {p,a,d}, weight?: number }>} inputs
 *   - specify a core emotion by id, or pass an arbitrary coord directly.
 * @returns {{ coord: {p,a,d}, nearest: object, distance: number, components: Array }}
 */
export function blendEmotions(inputs) {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw new Error('[PAD blend] at least one emotion input is required.');
  }

  let sumW = 0;
  const acc = { p: 0, a: 0, d: 0 };
  const components = [];

  for (const item of inputs) {
    const w = typeof item.weight === 'number' ? item.weight : 1;
    if (w <= 0) continue;

    // If an id is given, use the core emotion's coord; otherwise use the given coord.
    let coord = item.coord;
    if (item.id) {
      const emo = EMOTION_BY_ID[item.id];
      if (!emo) throw new Error(`[PAD blend] unknown emotion id: ${item.id}`);
      coord = { p: emo.p, a: emo.a, d: emo.d };
    }
    if (!coord) continue;

    acc.p += coord.p * w;
    acc.a += coord.a * w;
    acc.d += coord.d * w;
    sumW += w;
    components.push({ id: item.id || null, coord, weight: w });
  }

  if (sumW === 0) {
    throw new Error('[PAD blend] sum of weights is 0.');
  }

  const coord = {
    p: clamp(acc.p / sumW),
    a: clamp(acc.a / sumW),
    d: clamp(acc.d / sumW),
  };

  const { emotion: nearest, distance } = nearestEmotion(coord);
  return { coord, nearest, distance, components };
}
