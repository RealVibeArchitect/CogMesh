// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang).
// Dual-licensed: GNU AGPL-3.0-or-later (see /LICENSE) OR a commercial license
// (see /COMMERCIAL-LICENSE.md). The PAD formulae, coordinate values, and algorithms
// herein are original works of the author (see the CogMesh Technical Whitepaper).
// This program is free software: redistribute/modify under the AGPL; it comes with
// NO WARRANTY. If you run a modified version over a network, the AGPL requires you to
// offer its complete source to users.

// src/core/orchestration/MeshRouter.js
// CogMesh Sprint 14 — Mesh Orchestration (routing stage)
//
// CogMesh v1.0 spec item 6 (Mesh Orchestration):
//   Uses a Mesh structure, not a Tree. All engines evaluate/verify/complement/feed back to each other.
//
// What this sprint implements (honest scope):
//   - route(): asks every registered engine canHandle(), then selects and runs the engine
//     with the highest confidence. (engine compete → select = the first Mesh stage)
//
// What is NOT implemented yet (to avoid over-claiming):
//   - a full bidirectional mesh of engine "verify/complement/feedback" (a loop that critiques
//     and revises each other output) is deferred to a later sprint. For now, one-way routing only.
//
// Design principles:
//   - MeshRouter depends only on EngineRegistry (never imports individual engines = loose coupling).
//   - It works safely even if an engine does not implement canHandle (backward compatible).

import { normalizeReview } from './reviewTypes.js';
import { deriveMood } from './meshMood.js';
import { reflect } from '../pad/index.js';
import { selfCorrect } from '../reflection/selfCorrection.js';
import { allocateBudget } from '../orchestrator/boundedRationality.js';
import { transformInput } from '../orchestrator/inputTransform.js';
import { logger } from '../util/logger.js';

export class MeshRouter {
  /**
   * @param {import('./EngineRegistry').EngineRegistry} registry
   */
  constructor(registry) {
    if (!registry) throw new Error('[MeshRouter] a registry is required.');
    this.registry = registry;
  }

  /**
   * Ask every engine whether it can handle this input, and build a candidate list.
   * @param {string} input
   * @returns {Array<{ id: string, confidence: number, canHandle: boolean, detail?: object }>}
   */
  poll(input) {
    const candidates = [];

    for (const id of this.registry.list()) {
      const engine = this.registry.get(id);
      if (!engine) continue;

      // engines without canHandle are treated as confidence 0, canHandle=false (backward compatible)
      if (typeof engine.canHandle !== 'function') {
        candidates.push({ id, confidence: 0, canHandle: false });
        continue;
      }

      try {
        const verdict = engine.canHandle(input);
        candidates.push({
          id,
          confidence: verdict?.confidence ?? 0,
          canHandle: !!verdict?.canHandle,
          detail: verdict?.detail,
        });
      } catch (e) {
        // even if one engine throws, overall routing must continue.

        logger.warn('MeshRouter', `error while running '${id}' canHandle:`, e);
        candidates.push({ id, confidence: 0, canHandle: false });
      }
    }

    // sort by confidence descending
    candidates.sort((a, b) => b.confidence - a.confidence);
    return candidates;
  }

  /**
   * Engines other than the primary review the primary answer from their own perspective.
   * (Sprint 15B — the cross-review stage of the bidirectional Mesh)
   * @param {string} input
   * @param {string} primaryEngineId - the engine that produced the primary answer (excluded from review)
   * @param {any} primaryResult
   * @param {object} ctx
   * @returns {Array} list of valid reviews (relevance>0 or has a note)
   */
  collectReviews(input, primaryEngineId, primaryResult, ctx = {}) {
    const reviews = [];

    for (const id of this.registry.list()) {
      if (id === primaryEngineId) continue; // an engine does not review its own answer
      const engine = this.registry.get(id);
      if (!engine || typeof engine.review !== 'function') continue;

      try {
        const raw = engine.review(input, primaryResult, ctx);
        const review = normalizeReview(id, raw);
        // keep only reviews that are relevant or carry a comment
        if (review.relevance > 0 || review.note) reviews.push(review);
      } catch (e) {
        // even if one engine review throws, the overall flow continues.

        logger.warn('MeshRouter', `error while running '${id}' review:`, e);
      }
    }

    // sort by relevance descending
    reviews.sort((a, b) => b.relevance - a.relevance);
    return reviews;
  }

  /**
   * Route the input to the most suitable engine and run it.
   * @param {string} input
   * @param {object} [ctx] - context passed to the engine run() (lang, etc.)
   * @param {{ fallbackEngineId?: string, withReviews?: boolean }} [opts]
   * @returns {Promise<{ engineId: string, result: any, candidates: Array, reviews: Array }>}
   */
  async route(input, ctx = {}, opts = {}) {
    const candidates = this.poll(input);
    const top = candidates.find((c) => c.canHandle);

    // if nobody raises a hand, use the fallback engine (default: finance — preserves prior app behavior)
    const chosenId = top?.id || opts.fallbackEngineId || 'finance';
    const engine = this.registry.get(chosenId);

    if (!engine) {
      throw new Error(`[MeshRouter] routing failed: engine '${chosenId}' not found.`);
    }

    // Sprint 17: metacognitive self-observation
    const metacognition = this.metacognize(candidates, chosenId, ctx);

    // Sprint 18: uncertainty awareness → self-braking.
    // if opts.holdOnUncertainty is true and uncertainty exceeds the threshold,
    // return an ask-back signal instead of running the engine (request clarification, not nonsense).
    const correction = selfCorrect(candidates, metacognition, { lang: ctx.lang || 'en' });
    if (opts.holdOnUncertainty && correction.shouldHold) {
      return {
        engineId: chosenId,
        held: true,           // execution was held
        result: null,
        clarifyPrompt: correction.reason,
        candidates,
        reviews: [],
        metacognition,
        correction,
      };
    }

    // Sprint 19: the compute budget to allocate to this problem (Bounded Rationality)
    const budget = this.allocateBudgetFor(input, candidates, metacognition, correction, ctx);

    // Sprint 20: S-Infinity input transform X' = T_θ(X).
    // inject the cognition so far (stance, budget, World Model) into the input to transform its representation.
    // if opts.transformInput is false, use the original as-is (transform is on by default).
    let effectiveInput = input;
    let transform = null;
    if (opts.transformInput !== false) {
      transform = transformInput(input, {
        metacognition,
        budget: budget.budget,
        lang: ctx.lang || 'en',
        includeWorld: opts.includeWorld === true, // off by default (inject ticker context only when wanted)
      });
      effectiveInput = transform.transformed;
    }

    // pass the allocated budget (maxTokens, etc.) into the engine execution context.
    const runCtx = { ...ctx, budget: budget.budget };
    const result = await engine.run(effectiveInput, runCtx);

    // Sprint 15B: cross-review by other engines (can be skipped if opts.withReviews is false)
    const reviews = opts.withReviews === false
      ? []
      : this.collectReviews(input, chosenId, result, ctx);

    return { engineId: chosenId, held: false, result, candidates, reviews, metacognition, correction, budget, transform };
  }

  /**
   * CogMesh Sprint 17 — metacognitive observation.
   * From the current routing situation (who raised a hand, how confident) induce the
   * system reasoning stance and observe its own state via the PAD metacognition layer.
   * @param {Array} candidates - poll result
   * @param {string|null} chosenId
   * @param {{ lang?: 'ko'|'en' }} [ctx]
   * @returns {{ mood: Array, state: object, params: object, selfReport: string } | null}
   */
  metacognize(candidates, chosenId, ctx = {}) {
    try {
      const mood = deriveMood(candidates, chosenId);
      const reflection = reflect(mood, { lang: ctx.lang || 'en' });
      return { mood, ...reflection };
    } catch (e) {
      // metacognition failure must not block routing (it is an auxiliary layer).

      logger.warn('MeshRouter', 'metacognize failed:', e);
      return null;
    }
  }

  /**
   * CogMesh Sprint 19 — compute budget allocation (Bounded Rationality).
   * Gather signals from the routing situation to decide how much resource to spend on this problem.
   * @param {string} input
   * @param {Array} candidates
   * @param {object|null} metacognition
   * @param {object|null} correction
   * @param {{ lang?: 'ko'|'en' }} [ctx]
   */
  allocateBudgetFor(input, candidates, metacognition, correction, ctx = {}) {
    const handlers = (candidates || []).filter((c) => c.canHandle);
    const signals = {
      confidence: handlers.length ? handlers[0].confidence : 0,
      uncertainty: correction?.uncertainty ?? 0,
      inputLength: (input || '').length,
      exploration: metacognition?.params?.exploration ?? 0,
    };
    return allocateBudget(signals, { lang: ctx.lang || 'en' });
  }

  /**
   * Compute only a routing + review + metacognition preview without executing (for UI display, no LLM call).
   * @param {string} input
   * @param {object} [ctx]
   * @returns {{ chosenId: string|null, candidates: Array, reviews: Array, metacognition: object|null }}
   */
  previewWithReviews(input, ctx = {}) {
    const candidates = this.poll(input);
    const top = candidates.find((c) => c.canHandle);
    const chosenId = top?.id || null;

    // gather other engines reviews only when a primary is chosen (primaryResult is null since none yet)
    const reviews = chosenId
      ? this.collectReviews(input, chosenId, null, ctx)
      : [];

    // Sprint 17: metacognitive self-observation from the routing situation
    const metacognition = input && input.trim()
      ? this.metacognize(candidates, chosenId, ctx)
      : null;

    // Sprint 18: uncertainty awareness → self-braking decision
    const correction = input && input.trim()
      ? selfCorrect(candidates, metacognition, { lang: ctx.lang || 'en' })
      : null;

    // Sprint 19: compute budget allocation (Bounded Rationality)
    const budget = input && input.trim()
      ? this.allocateBudgetFor(input, candidates, metacognition, correction, ctx)
      : null;

    return { chosenId, candidates, reviews, metacognition, correction, budget };
  }
}
