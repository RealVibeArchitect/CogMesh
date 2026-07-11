// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/reflection/index.js — public API for the reflection layer.
//
//   - assessUncertainty / selfCorrect  self-braking when the situation is uncertain
//   - estimateConfidence               a calibrated 0~1 confidence for a response

export { assessUncertainty, selfCorrect, UNCERTAINTY_THRESHOLD } from './selfCorrection.js';
export { estimateConfidence } from './confidence.js';
