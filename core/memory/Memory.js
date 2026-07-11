// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang).
// Dual-licensed: GNU AGPL-3.0-or-later (see /LICENSE) OR a commercial license
// (see /COMMERCIAL-LICENSE.md). The PAD formulae, coordinate values, and algorithms
// herein are original works of the author (see the CogMesh Technical Whitepaper).
// This program is free software: redistribute/modify under the AGPL; it comes with
// NO WARRANTY. If you run a modified version over a network, the AGPL requires you to
// offer its complete source to users.

// core/memory/Memory.js
// Backward-compatible alias — Memory is the old name for EpisodeMemory.
// New code should prefer EpisodeMemory / WorkingMemory / SemanticMemory / ReflectionMemory.

export { EpisodeMemory as Memory } from './EpisodeMemory.js';
