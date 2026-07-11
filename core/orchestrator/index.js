// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/orchestrator/index.js — public API for the orchestration layer.
//
//   - allocateBudget / computeCost  bounded rationality (how much to "think")
//   - transformInput                inject cognitive context into the prompt
//   - Planner                       decompose a goal into ordered, executable steps

export { allocateBudget, computeCost, computeWorldCost, BUDGET_TIERS } from './boundedRationality.js';
export { transformInput } from './inputTransform.js';
export { Planner, TEMPLATES } from './planner.js';
export { GoalManager } from './goalManager.js';
export { DeliberativeLoop } from './deliberativeLoop.js';
