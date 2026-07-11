// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/mesh/index.js — engine mesh orchestration (routing, cross-review, mood).
//
//   - EngineRegistry / engineRegistry   register domain engines by id
//   - MeshRouter                        poll → route → cross-review → metacognize
//   - deriveMood                        routing situation → PAD mood signal
//   - normalizeReview / emptyReview     canonical cross-review shapes

export { EngineRegistry, engineRegistry } from './EngineRegistry.js';
export { MeshRouter } from './MeshRouter.js';
export { deriveMood } from './meshMood.js';
export { normalizeReview, emptyReview } from './reviewTypes.js';
