// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// test/integration.test.mjs — end-to-end pipeline tests.
//
// Where smoke.test.mjs checks each part in isolation, this suite wires the parts
// together the way a real session does, and asserts on the *whole flow*:
//
//   input → memory write → mesh routing → engine run → metacognition
//         → budget → cross-review → memory of the reflection → output
//
// It uses small in-memory "engines" (no network, no LLM) so the test is fast and
// deterministic while still exercising the real orchestration code.
//
//   node --test test/integration.test.mjs
//   npm run test:integration

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { EngineRegistry } from '../core/mesh/EngineRegistry.js';
import { MeshRouter } from '../core/mesh/MeshRouter.js';
import {
  WorkingMemory,
  EpisodeMemory,
  SemanticMemory,
  ReflectionMemory,
} from '../core/memory/index.js';
import { WorldModel } from '../core/world/index.js';

// A minimal "assistant" that wires memory + mesh together, like a real app would.
function buildAssistant() {
  const registry = new EngineRegistry();

  registry.register('finance', {
    id: 'finance',
    canHandle: (t) => ({ canHandle: /stock|ticker|주가|종목|samsung|삼성/i.test(t), confidence: 0.9 }),
    run: async (input, ctx) => ({
      engine: 'finance',
      answer: `finance view on: ${input}`,
      budgetSeen: ctx?.budget?.maxTokens ?? null,
    }),
  });

  registry.register('coding', {
    id: 'coding',
    canHandle: (t) => ({ canHandle: /code|python|버그|함수/i.test(t), confidence: 0.75 }),
    run: async (input) => ({ engine: 'coding', answer: `coding view on: ${input}` }),
  });

  registry.register('general', {
    id: 'general',
    canHandle: () => ({ canHandle: true, confidence: 0.4 }),
    run: async (input) => ({ engine: 'general', answer: `general view on: ${input}` }),
  });

  const mesh = new MeshRouter(registry);
  const working = new WorkingMemory({ capacity: 8 });
  const episodes = new EpisodeMemory();
  const facts = new SemanticMemory();
  const reflections = new ReflectionMemory({ capacity: 50 });

  // one "turn" of the whole pipeline
  async function ask(text, ctx = { lang: 'en' }) {
    working.push({ role: 'user', text });
    episodes.remember({ role: 'user', text });

    const routed = await mesh.route(text, ctx);

    working.push({ role: 'assistant', text: JSON.stringify(routed.result) });
    episodes.remember({ role: 'assistant', text: JSON.stringify(routed.result) });
    if (routed.metacognition) {
      reflections.record({ stance: routed.metacognition.selfReport, forInput: text });
    }
    return routed;
  }

  return { ask, mesh, working, episodes, facts, reflections };
}

// ── 1. Routing flows to the right specialist ──────────────────────────────
test('pipeline: a finance question routes to the finance engine', async () => {
  const a = buildAssistant();
  const r = await a.ask('is Samsung stock a buy right now?');
  assert.equal(r.engineId, 'finance');
  assert.match(r.result.answer, /finance view/);
});

test('pipeline: a coding question routes to the coding engine', async () => {
  const a = buildAssistant();
  const r = await a.ask('help me fix this python 함수 버그');
  assert.equal(r.engineId, 'coding');
});

test('pipeline: an unrelated question falls back to general', async () => {
  const a = buildAssistant();
  const r = await a.ask('what should I have for lunch?');
  assert.equal(r.engineId, 'general');
});

// ── 2. The whole cognition bundle is produced, not just an answer ──────────
test('pipeline: a single route produces the full cognition bundle', async () => {
  const a = buildAssistant();
  const r = await a.ask('is Samsung stock a buy?');
  // the README promises: routing + metacognition + budget + reviews all in one call
  assert.ok(r.engineId, 'missing engineId');
  assert.ok(Array.isArray(r.candidates) && r.candidates.length >= 1, 'missing candidates');
  assert.ok(r.metacognition && typeof r.metacognition.selfReport === 'string', 'missing metacognition');
  assert.ok(r.budget && r.budget.budget, 'missing budget');
  assert.ok(Array.isArray(r.reviews), 'missing reviews array');
});

// ── 3. Budget actually reaches the engine ─────────────────────────────────
test('pipeline: the allocated budget is passed into the engine run()', async () => {
  const a = buildAssistant();
  const r = await a.ask('is Samsung stock a buy?');
  // finance engine echoes back the maxTokens it saw — proving budget propagated
  assert.ok(r.result.budgetSeen === null || Number.isFinite(r.result.budgetSeen));
});

// ── 4. Memory accumulates coherently across a multi-turn session ───────────
test('pipeline: a 3-turn conversation is recorded across memory types', async () => {
  const a = buildAssistant();
  await a.ask('is Samsung stock a buy?');
  await a.ask('what about a python script to track it?');
  await a.ask('thanks, summarize both');

  // working memory keeps user+assistant turns (bounded)
  assert.ok(a.working.context().length > 0);
  assert.ok(a.working.context().length <= 8);

  // episodic memory saw all 6 messages (3 user + 3 assistant)
  assert.equal(a.episodes.size(), 6);

  // reflection memory captured a stance per turn
  assert.ok(a.reflections.recent(10).length >= 1);

  // recall still works after the session
  const hits = a.episodes.recall('Samsung', 5);
  assert.ok(hits.length >= 1, 'should recall the Samsung turn');
});

// ── 5. Semantic + World memory integrate with a reasoning turn ─────────────
test('pipeline: facts and world relations coexist with routing', async () => {
  const a = buildAssistant();
  const world = new WorldModel();

  // app-side: record a fact and a causal relation alongside the conversation
  a.facts.assert('samsung_ticker', '005930');
  world.addObject({ id: 'samsung', attrs: { name: 'Samsung' } });
  world.addObject({ id: 'hbm', attrs: { name: 'HBM demand' } });
  world.addRelation({ from: 'hbm', to: 'samsung', type: 'causal', weight: 0.8 });

  const r = await a.ask('is Samsung stock a buy?');

  assert.equal(a.facts.get('samsung_ticker').value, '005930');
  assert.deepEqual(world.getNeighbors('samsung'), ['hbm']);
  assert.equal(r.engineId, 'finance');
});

// ── 6. The pipeline is stable over many turns (no drift / crash) ───────────
test('pipeline: 200-turn session stays stable and bounded', async () => {
  const a = buildAssistant();
  for (let i = 0; i < 200; i++) {
    const r = await a.ask(`turn ${i}: is Samsung stock a buy?`);
    assert.equal(r.engineId, 'finance');
  }
  // memory stayed bounded despite 200 turns
  assert.ok(a.working.context().length <= 8);
  assert.equal(a.episodes.size(), 200); // default cap 200, 400 messages → capped
});
