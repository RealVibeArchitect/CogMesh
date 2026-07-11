// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang).
// Dual-licensed: GNU AGPL-3.0-or-later (see /LICENSE) OR a commercial license
// (see /COMMERCIAL-LICENSE.md). The PAD formulae, coordinate values, and algorithms
// herein are original works of the author (see the CogMesh Technical Whitepaper).
// This program is free software: redistribute/modify under the AGPL; it comes with
// NO WARRANTY. If you run a modified version over a network, the AGPL requires you to
// offer its complete source to users.

// core/memory/index.js
// CogMesh Memory module public API
//
// Four kinds of memory:
//   - WorkingMemory     short-term working context (the immediately preceding turns)
//   - EpisodeMemory     chronological episodic memory (when which conversation)
//   - SemanticMemory    fact/concept memory (key-value)
//   - ReflectionMemory  self-reflective memory (past reasoning stances)

export { WorkingMemory } from './WorkingMemory.js';
export { EpisodeMemory } from './EpisodeMemory.js';
export { SemanticMemory } from './SemanticMemory.js';
export { ReflectionMemory } from './ReflectionMemory.js';

// memory compression — summarize evicted history instead of dropping it (opt-in)
export { compressTurns } from './MemoryCompressor.js';

// backward compatibility
export { EpisodeMemory as Memory } from './EpisodeMemory.js';
