// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang).
// Dual-licensed: GNU AGPL-3.0-or-later (see /LICENSE) OR a commercial license
// (see /COMMERCIAL-LICENSE.md). The PAD formulae, coordinate values, and algorithms
// herein are original works of the author (see the CogMesh Technical Whitepaper).
// This program is free software: redistribute/modify under the AGPL; it comes with
// NO WARRANTY. If you run a modified version over a network, the AGPL requires you to
// offer its complete source to users.

// src/core/pad/index.js
// CogMesh PAD module public API
//
// Sprint 11: base coordinate system + EMA state tracking (emotionMap, nearestEmotion, padState)
// Sprint 16: promote PAD to the top of reasoning = the metacognition layer
//   - Level 1 linear blend
//   - Level 2 nonlinear emergence: emotion combination → birth of a new emotion
//   - metacognition: observe self-state → translate into reasoning parameters

export { EMOTIONS, EMOTION_BY_ID } from './emotionMap.js';
export { nearestEmotion, euclideanDistance } from './nearestEmotion.js';
export { PADState } from './padState.js';

// Sprint 16 — Level 1 / Level 2 / metacognition
export { blendEmotions } from './emotionBlending.js';
export { synthesize, EMERGENCE_THRESHOLD } from './emergence.js';
export { reflect, toReasoningParams } from './metacognition.js';
