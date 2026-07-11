// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang).
// Dual-licensed: GNU AGPL-3.0-or-later (see /LICENSE) OR a commercial license
// (see /COMMERCIAL-LICENSE.md). The PAD formulae, coordinate values, and algorithms
// herein are original works of the author (see the CogMesh Technical Whitepaper).
// This program is free software: redistribute/modify under the AGPL; it comes with
// NO WARRANTY. If you run a modified version over a network, the AGPL requires you to
// offer its complete source to users.

// src/core/world/index.js
// CogMesh Sprint 12 — World Model public API
//
// Like PAD (Sprint 11), this sprint is not yet wired into the UI/finance engines.
// Candidate integration points (to be decided in the Sprint 13 Mesh stage):
//   - register tickers/companies analyzed by the finance engine via addObject
//   - register causal-analysis results (evidenceEngine) via addRelation
//   → then the World Model acts as a "causal graph of the tickers discussed so far,"
//     connecting naturally with the CAM (Causal Agent Mesh) project.

export { WorldModel } from './WorldModel.js';
export { WorldSimulator } from './WorldSimulator.js';
export { CalibrationLedger } from './CalibrationLedger.js';
