// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang).
// Dual-licensed: GNU AGPL-3.0-or-later (see /LICENSE) OR a commercial license
// (see /COMMERCIAL-LICENSE.md). The PAD formulae, coordinate values, and algorithms
// herein are original works of the author (see the CogMesh Technical Whitepaper).
// This program is free software: redistribute/modify under the AGPL; it comes with
// NO WARRANTY. If you run a modified version over a network, the AGPL requires you to
// offer its complete source to users.

// src/core/pad/nearestEmotion.js
// CogMesh Sprint 11 — nearest-neighbor emotion classification
//
// Document 03, "3. Technical Application":
//   "Nearest-point decision: from the current coordinate (p_x, a_y, d_z),
//    compute the Euclidean distance to each core emotion and pick the minimum."

import { EMOTIONS } from './emotionMap.js';

/**
 * Euclidean distance between two PAD coordinates.
 * @param {{p:number,a:number,d:number}} a
 * @param {{p:number,a:number,d:number}} b
 */
function euclideanDistance(a, b) {
  const dp = a.p - b.p;
  const da = a.a - b.a;
  const dd = a.d - b.d;
  return Math.sqrt(dp * dp + da * da + dd * dd);
}

/**
 * Find the core emotion nearest to the given PAD coordinate.
 * @param {{p:number,a:number,d:number}} coord
 * @returns {{ emotion: object, distance: number }}
 */
export function nearestEmotion(coord) {
  let best = null;
  let bestDist = Infinity;

  for (const emotion of EMOTIONS) {
    const dist = euclideanDistance(coord, emotion);
    if (dist < bestDist) {
      bestDist = dist;
      best = emotion;
    }
  }

  return { emotion: best, distance: bestDist };
}

export { euclideanDistance };
