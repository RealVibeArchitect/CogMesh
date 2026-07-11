// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang).
// Dual-licensed: GNU AGPL-3.0-or-later (see /LICENSE) OR a commercial license
// (see /COMMERCIAL-LICENSE.md). The PAD formulae, coordinate values, and algorithms
// herein are original works of the author (see the CogMesh Technical Whitepaper).
// This program is free software: redistribute/modify under the AGPL; it comes with
// NO WARRANTY. If you run a modified version over a network, the AGPL requires you to
// offer its complete source to users.

// core/instances.js
// CogMesh pure cognition library — globally shared instances
//
// Strips the UI/engine dependencies from the web app's bootstrapEngines.js and
// exposes only the global instances needed for pure cognition.
//
// worldModel: a global World Model that accumulates entities (tickers, etc.) seen in conversation.
//   Shared by Bounded Rationality's C_world computation and worldAdapter.

import { WorldModel } from './world/WorldModel.js';

export const worldModel = new WorldModel();
