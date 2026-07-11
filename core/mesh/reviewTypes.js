// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang).
// Dual-licensed: GNU AGPL-3.0-or-later (see /LICENSE) OR a commercial license
// (see /COMMERCIAL-LICENSE.md). The PAD formulae, coordinate values, and algorithms
// herein are original works of the author (see the CogMesh Technical Whitepaper).
// This program is free software: redistribute/modify under the AGPL; it comes with
// NO WARRANTY. If you run a modified version over a network, the AGPL requires you to
// offer its complete source to users.

// src/core/orchestration/reviewTypes.js
// CogMesh Sprint 15B — cross-review standard spec between engines
//
// From spec item 6 (Mesh Orchestration): engines evaluate/verify/complement each other —
// this standardizes the level of review the engines can honestly perform right now.
//
// Each engine review(input, primaryResult, ctx) returns the following shape:
//   {
//     reviewerId: string,     // id of the reviewing engine
//     relevance: number,      // how relevant to this engine own domain (0~1)
//     note: string | null,    // a human-readable one-line comment (null if none)
//     flags: string[],        // items detected but possibly not covered by the primary answer
//   }
//
// This is a supporting perspective, not a verdict on correctness.
// The design respects the limit that engines cannot fully understand each other domains.

/** an empty (neutral) review — when there is nothing to review */
export function emptyReview(reviewerId) {
  return { reviewerId, relevance: 0, note: null, flags: [] };
}

/** minimal validation that a review object has a valid shape */
export function normalizeReview(reviewerId, raw) {
  if (!raw || typeof raw !== 'object') return emptyReview(reviewerId);
  return {
    reviewerId,
    relevance: typeof raw.relevance === 'number' ? Math.max(0, Math.min(1, raw.relevance)) : 0,
    note: typeof raw.note === 'string' && raw.note.trim() ? raw.note.trim() : null,
    flags: Array.isArray(raw.flags) ? raw.flags.filter((f) => typeof f === 'string') : [],
  };
}
