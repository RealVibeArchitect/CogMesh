// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang).
// Dual-licensed: GNU AGPL-3.0-or-later (see /LICENSE) OR a commercial license
// (see /COMMERCIAL-LICENSE.md). The PAD formulae, coordinate values, and algorithms
// herein are original works of the author (see the CogMesh Technical Whitepaper).
// This program is free software: redistribute/modify under the AGPL; it comes with
// NO WARRANTY. If you run a modified version over a network, the AGPL requires you to
// offer its complete source to users.

// src/core/orchestration/EngineRegistry.js
// CogMesh Sprint 9 — Engine Registry (skeleton)
//
// Purpose:
//   Lets MainEngine register and look up each Specialist Engine
//   (finance, coding, legal, ...) via dependency injection,
//   instead of importing/hardcoding them directly.
//
// Design principles (CogMesh v1.0 spec item 10):
//   - Loose coupling: the registry knows nothing of an engine internals.
//   - High cohesion: it only registers/looks up engines (no routing or execution logic).
//
// Sprint 9 scope:
//   - provides only register / get / has / list.
//   - Mesh Orchestration (cross-engine review) is handled by a separate module after Sprint 13.
//   - World Model and PAD integration are not done yet (Sprints 11, 12).

import { logger } from '../util/logger.js';

class EngineRegistry {
  constructor() {
    /** @type {Map<string, EngineDescriptor>} */
    this._engines = new Map();
  }

  /**
   * Register an engine.
   * @param {string} id - engine identifier (e.g. 'finance', 'coding')
   * @param {object} engine - engine instance (interface: { name, run, ...})
   * @param {object} [meta] - extra metadata (version, description, etc.)
   */
  register(id, engine, meta = {}) {
    if (!id || typeof id !== 'string') {
      throw new Error('[EngineRegistry] register(id, engine): id must be a non-empty string.');
    }
    if (this._engines.has(id)) {
      logger.warn('EngineRegistry', `engine '${id}' is already registered; overwriting.`);
    }
    this._engines.set(id, { id, engine, meta, registeredAt: Date.now() });
    return this;
  }

  /**
   * Return the registered engine instance, or null if absent.
   * @param {string} id
   */
  get(id) {
    const entry = this._engines.get(id);
    return entry ? entry.engine : null;
  }

  /**
   * Check whether an engine is registered.
   * @param {string} id
   */
  has(id) {
    return this._engines.has(id);
  }

  /**
   * List of all registered engine ids.
   */
  list() {
    return Array.from(this._engines.keys());
  }

  /**
   * Unregister (for tests / hot reload).
   * @param {string} id
   */
  unregister(id) {
    return this._engines.delete(id);
  }
}

// Exported as a singleton — the whole app uses one registry.
export const engineRegistry = new EngineRegistry();

// The class itself is also exported so tests can create independent instances.
export { EngineRegistry };
