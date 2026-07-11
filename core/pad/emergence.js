// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang).
// Dual-licensed: GNU AGPL-3.0-or-later (see /LICENSE) OR a commercial license
// (see /COMMERCIAL-LICENSE.md). The PAD formulae, coordinate values, and algorithms
// herein are original works of the author (see the CogMesh Technical Whitepaper).
// This program is free software: redistribute/modify under the AGPL; it comes with
// NO WARRANTY. If you run a modified version over a network, the AGPL requires you to
// offer its complete source to users.

// src/core/pad/emergence.js
// CogMesh Sprint 16 — PAD Level 2: Nonlinear Emergence
//
// Core design idea: "emotions combine to create a *new* emotion."
//
// Level 1 (linear blending) yields a point in coordinate space. But true
// emergence happens when that point fits none of the 20 core emotions well —
// i.e. the birth of "a state that existing language cannot name."
//
// Two emergence mechanisms:
//   (1) Distance-based emergence: if the blended point is far even from its
//       nearest core emotion (exceeds the threshold) → treat it as a new,
//       unnamed emotion and generate a fresh label.
//   (2) Qualitative jump (nonlinear): certain emotion pairs become a wholly
//       different state rather than a simple average.
//       e.g. elated + sad = not the coordinate midpoint (neutral) but "nostalgia".
//       Such pairs are defined explicitly to give a nonlinear transform.

import { blendEmotions } from './emotionBlending.js';
import { nearestEmotion } from './nearestEmotion.js';
import { EMOTIONS } from './emotionMap.js';

// Emergence threshold: if the blended point is at least this far from its
// nearest core emotion, treat it as a "new emotion."
// (Max distance in PAD space is √(2²+2²+2²)=√12≈3.46, so 0.55 marks a "fairly ambiguous" spot.)
export const EMERGENCE_THRESHOLD = 0.55;

// Qualitative-jump rules: specific emotion combos → emergent coordinate + name.
// key is the two sorted ids joined by '+'.
const QUALITATIVE_JUMPS = {
  // elated + sad → nostalgia (bittersweet: mild pleasure + low arousal + neutral dominance)
  'elated+sad':      { p:  0.15, a: -0.30, d: -0.10, ko: '그리움',   en: 'Nostalgia'   },
  // curious + panic → thrill (scared yet drawn in)
  'curious+panic':   { p:  0.10, a:  0.85, d: -0.20, ko: '전율',     en: 'Thrill'      },
  // angry + sad → anguish (intense yet sinking)
  'angry+sad':       { p: -0.85, a:  0.20, d: -0.30, ko: '비통',     en: 'Anguish'     },
  // proud + vigilant → resolve (assured yet sharp)
  'proud+vigilant':  { p:  0.30, a:  0.55, d:  0.75, ko: '결의',     en: 'Resolve'     },
  // awe + panic → sublime (overwhelming beauty)
  'awe+panic':       { p:  0.20, a:  0.70, d: -0.45, ko: '숭고',     en: 'Sublime'     },
};

function jumpKey(idA, idB) {
  return [idA, idB].sort().join('+');
}

/**
 * Combine two or more emotions and also judge their "emergence potential."
 * @param {Array<{ id?: string, coord?: {p,a,d}, weight?: number }>} inputs
 * @param {{ threshold?: number }} [opts]
 * @returns {{
 *   coord: {p,a,d},
 *   emerged: boolean,           // did a new emotion emerge?
 *   label: { ko: string, en: string },
 *   kind: 'core' | 'qualitative' | 'novel',
 *   nearest: object,
 *   distance: number,
 * }}
 */
export function synthesize(inputs, opts = {}) {
  const threshold = opts.threshold ?? EMERGENCE_THRESHOLD;

  // --- (2) Check qualitative jump first: exactly two core emotions mixed at similar weight ---
  if (inputs.length === 2 && inputs[0].id && inputs[1].id) {
    const key = jumpKey(inputs[0].id, inputs[1].id);
    const jump = QUALITATIVE_JUMPS[key];
    if (jump) {
      const coord = { p: jump.p, a: jump.a, d: jump.d };
      const { emotion: nearest, distance } = nearestEmotion(coord);
      return {
        coord,
        emerged: true,
        label: { ko: jump.ko, en: jump.en },
        kind: 'qualitative',
        nearest,
        distance,
      };
    }
  }

  // --- (1) Linear blend, then distance-based emergence check ---
  const { coord, nearest, distance } = blendEmotions(inputs);

  if (distance > threshold) {
    // Unnamed new emotion — borrow the two nearest cores' names for a temp label
    const label = generateNovelLabel(coord, nearest);
    return { coord, emerged: true, label, kind: 'novel', nearest, distance };
  }

  // No emergence: just converge to the nearest core emotion
  return {
    coord,
    emerged: false,
    label: { ko: nearest.label.ko, en: nearest.label.en },
    kind: 'core',
    nearest,
    distance,
  };
}

/**
 * Attach a temporary label to an unnamed new emotion.
 * Finds the two nearest core emotions and expresses it as "A-tinged B"
 * (leaving a trace of the emergence).
 */
function generateNovelLabel(coord) {
  const sorted = EMOTIONS
    .map((e) => ({ e, d: Math.hypot(coord.p - e.p, coord.a - e.a, coord.d - e.d) }))
    .sort((a, b) => a.d - b.d);

  const first = sorted[0].e;
  const second = sorted[1]?.e || first;

  return {
    ko: `${first.label.ko}빛 ${second.label.ko}`,   // e.g. "경계빛 호기심" (Vigilant-tinged Curious)
    en: `${first.label.en}-tinged ${second.label.en}`,
  };
}
