// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/world/WorldSimulator.js — imagine and compare futures on a World Model.
//
// The World Model holds the *current* state. The Simulator uses it to look *ahead*:
// given a set of candidate actions, it branches an independent copy of the world for
// each, applies the action, and scores the resulting future — so the agent can pick
// the best action by trying them all in imagination first, never touching reality.
//
//     current state
//        ├─ action A → branch → future₁ → score
//        ├─ action B → branch → future₂ → score
//        └─ action C → branch → future₃ → score
//                                   ↓
//                           choose the best future
//
// This is "planning by simulation" (a.k.a. model-based rollout). It's dependency-free:
// you supply how an action changes the world (applyFn) and how good a future is
// (scoreFn). Defaults are provided so it works out of the box, and both can be swapped
// for learned models later.

/**
 * Default action model: apply an action's `effects` (a partial state patch per object)
 * to the branched world. An action looks like:
 *   { id:'buy', effects: { samsung: { price: 85000 } }, field: { sentiment: 0.8 } }
 */
function defaultApply(world, action) {
  if (!action || typeof action !== 'object') return world;
  // addObject() already merge-updates existing state, so passing the raw patch is
  // both correct and avoids a redundant second spread of the existing state.
  if (action.effects) {
    for (const [objId, patch] of Object.entries(action.effects)) {
      world.addObject({ id: objId, state: patch });
    }
  }
  if (action.field) {
    for (const [k, v] of Object.entries(action.field)) {
      world.setField(k, v);
    }
  }
  return world;
}

/**
 * Default scorer: sum a set of weighted "goal" fields from the world's field snapshot,
 * so a future that pushes the tracked signals up scores higher. If no goals are given,
 * falls back to the number of objects (a trivial, always-defined signal).
 */
function makeDefaultScore(goalWeights = {}) {
  return (world) => {
    const field = world.getFieldSnapshot();
    const keys = Object.keys(goalWeights);
    if (keys.length === 0) return world.listObjects().length;
    let score = 0;
    for (const k of keys) {
      const v = typeof field[k] === 'number' ? field[k] : 0;
      score += v * goalWeights[k];
    }
    return score;
  };
}

export class WorldSimulator {
  /**
   * @param {import('./WorldModel.js').WorldModel} world  the live world model
   * @param {{ applyFn?: function, scoreFn?: function, goalWeights?: object }} [opts]
   *   applyFn(world, action) → mutate the branched world for this action
   *   scoreFn(world, ctx)    → number; higher = more desirable future
   */
  constructor(world, opts = {}) {
    this.world = world;
    const customApply = typeof opts.applyFn === 'function';
    const customScore = typeof opts.scoreFn === 'function';
    this._apply = customApply ? opts.applyFn : defaultApply;
    this._score = customScore
      ? opts.scoreFn
      : makeDefaultScore(opts.goalWeights || {});
    // Retain goalWeights ONLY when using the default apply+score, so a worker thread can
    // rebuild an identical simulator from data. With custom functions this stays null and
    // the simulator is (correctly) treated as non-parallelizable — functions can't cross
    // the thread boundary. Purely additive; changes no existing behavior.
    this._goalWeights = (!customApply && !customScore) ? { ...(opts.goalWeights || {}) } : null;
  }

  /**
   * Simulate a single action on a fresh branch and return the resulting future.
   * The live world is never modified.
   */
  rollout(action, { steps = 1 } = {}) {
    const branch = this.world.branch();
    for (let i = 0; i < Math.max(1, steps); i++) {
      this._apply(branch, action);
    }
    return {
      action,
      score: this._score(branch, { action }),
      future: branch.snapshot(),
    };
  }

  /**
   * Imagine every candidate action, score each future, and return them ranked
   * best-first. `best` is the top future; `alternatives` are the rest.
   *
   * @param {Array} actions  candidate actions
   * @param {{ steps?: number }} [opts]
   */
  imagine(actions, opts = {}) {
    const list = Array.isArray(actions) ? actions : [];
    if (list.length === 0) return { best: null, ranked: [], considered: 0 };

    const ranked = list
      .map((action) => this.rollout(action, opts))
      .sort((a, b) => b.score - a.score);

    return {
      best: ranked[0],
      alternatives: ranked.slice(1),
      ranked,
      considered: ranked.length,
    };
  }

  /**
   * Convenience: pick the single best action for a set of candidates.
   * Returns { action, score, future } or null.
   */
  chooseBest(actions, opts = {}) {
    return this.imagine(actions, opts).best;
  }
}

export { defaultApply, makeDefaultScore };
