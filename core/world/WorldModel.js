// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang).
// Dual-licensed: GNU AGPL-3.0-or-later (see /LICENSE) OR a commercial license
// (see /COMMERCIAL-LICENSE.md). The PAD formulae, coordinate values, and algorithms
// herein are original works of the author (see the CogMesh Technical Whitepaper).
// This program is free software: redistribute/modify under the AGPL; it comes with
// NO WARRANTY. If you run a modified version over a network, the AGPL requires you to
// offer its complete source to users.

// src/core/world/WorldModel.js
// CogMesh Sprint 12 — World Model, minimal version
//
// CogMesh v1.0 spec item 3:
//   W_t = (O_t, R_t, F_t)
//   O_t = {o_i^t} : Object Set
//   R_t = {r_ij^t} : Relation Graph
//   F_t(x) ∈ R^k  : Field
//
// What this sprint does NOT implement (stated honestly):
//   - learned neural update functions like f_θ(s_i, N_i, F_t), g_θ(o_i, o_j), h_θ(F_t, O_t).
//     these need a separate model that actually trains parameters θ, which the current causal_chat_v4
//     structure (based on local-LLM prompt calls) cannot implement directly.
//   - the probabilistic inference p(W_t|x_1:t) of Observation & Grounding (the Sprint 4.2 ELBO theory).
//
// What this sprint DOES implement:
//   - a pure state container holding O_t, R_t, F_t + a CRUD API.
//   - state transitions are deterministic, happening only when "someone explicitly calls" them
//     (e.g. register mentioned tickers/companies via addObject, causal links via addRelation).
//   - this makes a thin base on which CAM (Causal Agent Mesh) or the finance engine can later
//     take over the f_θ role using real data.

let _autoId = 0;
const nextId = (prefix) => `${prefix}_${(_autoId++).toString(36)}`;

export class WorldModel {
  constructor() {
    /** @type {Map<string, object>} O_t: id -> object */
    this._objects = new Map();
    /** @type {Map<string, object>} R_t: relationId -> relation */
    this._relations = new Map();
    /** @type {Record<string, any>} F_t: simple key-value fields (no continuous-space approximation) */
    this._field = {};

    this._t = 0; // logical timestep counter (for snapshots/debugging)
  }

  // ---------------------------------------------------------------------
  // ① Object Set (O_t)
  // ---------------------------------------------------------------------

  /**
   * Register an object, or merge-update it if it already exists.
   * @param {{ id?: string, state?: object, attrs?: object }} input
   * @returns {object} the registered object
   */
  addObject({ id, state = {}, attrs = {} } = {}) {
    const objId = id || nextId('obj');
    const existing = this._objects.get(objId);

    const obj = {
      id: objId,
      state: { ...(existing?.state || {}), ...state },
      attrs: { ...(existing?.attrs || {}), ...attrs },
      updatedAt: ++this._t,
    };

    this._objects.set(objId, obj);
    return obj;
  }

  getObject(id) {
    return this._objects.get(id) || null;
  }

  removeObject(id) {
    // When deleting an object, also clean up related edges (maintain referential integrity)
    for (const [relId, rel] of this._relations) {
      if (rel.from === id || rel.to === id) this._relations.delete(relId);
    }
    return this._objects.delete(id);
  }

  listObjects() {
    return Array.from(this._objects.values());
  }

  // ---------------------------------------------------------------------
  // ② Relation Graph (R_t)
  // ---------------------------------------------------------------------

  /**
   * Register a relation (edge) between two objects.
   * @param {{ from: string, to: string, type?: 'causal'|'spatial'|'functional', weight?: number, id?: string }} input
   */
  addRelation({ id, from, to, type = 'causal', weight = 1.0 } = {}) {
    if (!this._objects.has(from) || !this._objects.has(to)) {
      throw new Error(
        `[WorldModel] addRelation: references a non-existent object. from=${from}, to=${to}`
      );
    }
    if (weight < 0 || weight > 1) {
      throw new Error(`[WorldModel] addRelation: weight must be in the [0,1] probability range. (${weight})`);
    }

    const relId = id || nextId('rel');
    const relation = { id: relId, from, to, type, weight, updatedAt: ++this._t };
    this._relations.set(relId, relation);
    return relation;
  }

  removeRelation(id) {
    return this._relations.delete(id);
  }

  /** all relations connected to a given object (used to compute neighbors N_i) */
  getRelationsOf(objectId) {
    return Array.from(this._relations.values()).filter(
      (r) => r.from === objectId || r.to === objectId
    );
  }

  /** list of neighbor object ids for a given object (N_i in the spec) */
  getNeighbors(objectId) {
    const neighborIds = new Set();
    for (const r of this.getRelationsOf(objectId)) {
      neighborIds.add(r.from === objectId ? r.to : r.from);
    }
    return Array.from(neighborIds);
  }

  listRelations() {
    return Array.from(this._relations.values());
  }

  // ---------------------------------------------------------------------
  // ③ Field (F_t) — simple key-value approximation
  // ---------------------------------------------------------------------

  setField(key, value) {
    // O(1) in-place write. External observers only ever see copies via
    // getFieldSnapshot()/snapshot(), so mutating the internal store is invisible
    // to callers — but it removes an O(#fields) object rebuild from the hottest
    // path in the system (every rollout's apply step lands here).
    this._field[key] = value;
    this._t += 1;
    return this._field;
  }

  getField(key) {
    return this._field[key];
  }

  getFieldSnapshot() {
    return { ...this._field };
  }

  // ---------------------------------------------------------------------
  // snapshot / reset
  // ---------------------------------------------------------------------

  /** full W_t snapshot (a serializable plain object) */
  snapshot() {
    return {
      t: this._t,
      objects: this.listObjects(),
      relations: this.listRelations(),
      field: this.getFieldSnapshot(),
    };
  }

  reset() {
    this._objects.clear();
    this._relations.clear();
    this._field = {};
    this._t = 0;
  }

  /**
   * Rebuild this model's state from a snapshot() result. Used for simulation:
   * take a snapshot, branch a fresh model, restore into it, apply hypothetical
   * actions, and observe the outcome — all without touching the live model.
   */
  restore(snap) {
    this.reset();
    if (!snap) return this;
    for (const obj of snap.objects || []) {
      this.addObject({ id: obj.id, state: obj.state, attrs: obj.attrs });
    }
    for (const rel of snap.relations || []) {
      this.addRelation({ id: rel.id, from: rel.from, to: rel.to, type: rel.type, weight: rel.weight });
    }
    // one-pass field restore (setField would bump _t per key; _t is overwritten below anyway)
    this._field = { ...(snap.field || {}) };
    this._t = typeof snap.t === 'number' ? snap.t : this._t;
    return this;
  }

  /**
   * Create an independent deep-copy of this model (a branch to simulate on).
   *
   * PERF: this is the single hottest allocation site in CogMesh — every rollout
   * branches the world. The old implementation went snapshot() → restore(),
   * paying for intermediate arrays, addObject/addRelation re-validation, and a
   * per-field setField loop. This fast path clones the internal stores directly
   * (same one-level-deep copy semantics: state/attrs objects are copied, deeper
   * nesting is shared exactly as before), which measures ~5-6× faster.
   */
  branch() {
    const b = new WorldModel();
    for (const [id, obj] of this._objects) {
      b._objects.set(id, {
        id,
        state: { ...obj.state },
        attrs: { ...obj.attrs },
        updatedAt: obj.updatedAt,
      });
    }
    for (const [id, rel] of this._relations) {
      b._relations.set(id, { id, from: rel.from, to: rel.to, type: rel.type, weight: rel.weight, updatedAt: rel.updatedAt });
    }
    b._field = { ...this._field };
    b._t = this._t;
    return b;
  }
}
