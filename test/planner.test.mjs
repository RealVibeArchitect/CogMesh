// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// test/planner.test.mjs — tests for goal decomposition & multi-step execution.
//
//   node --test test/planner.test.mjs
//   npm run test:planner

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Planner } from '../core/orchestrator/planner.js';
import { EngineRegistry } from '../core/mesh/EngineRegistry.js';
import { MeshRouter } from '../core/mesh/MeshRouter.js';

// ── decomposition: goals become ordered, typed steps ──────────────────────
test('planner: a finance goal decomposes into ordered finance steps', () => {
  const p = new Planner().plan('analyze Samsung stock');
  assert.equal(p.strategy, 'finance');
  assert.equal(p.steps.length, 4);
  assert.deepEqual(p.steps.map((s) => s.action), ['gather', 'analyze', 'assess', 'conclude']);
  // steps are indexed in order
  assert.deepEqual(p.steps.map((s) => s.index), [0, 1, 2, 3]);
});

test('planner: coding / research goals pick their own templates', () => {
  assert.equal(new Planner().plan('fix the login bug').strategy, 'coding');
  assert.equal(new Planner().plan('compare React and Vue').strategy, 'research');
});

test('planner: an unrecognized goal falls back to a generic plan', () => {
  const p = new Planner().plan('sing me a lullaby');
  assert.equal(p.strategy, 'generic');
  assert.ok(p.steps.length >= 1);
});

test('planner: Korean goals are recognized too', () => {
  assert.equal(new Planner().plan('삼성 주가 분석해줘').strategy, 'finance');
  assert.equal(new Planner().plan('로그인 버그 디버그해줘').strategy, 'coding');
});

test('planner: empty / bad input yields an empty plan, no throw', () => {
  assert.doesNotThrow(() => new Planner().plan(''));
  assert.equal(new Planner().plan('').steps.length, 0);
  assert.equal(new Planner().plan(null).strategy, 'empty');
});

// ── custom decomposer (e.g. an LLM) ───────────────────────────────────────
test('planner: a custom decomposer overrides the built-in templates', () => {
  const llm = (goal) => [{ action: 'llm-step', intent: `LLM plan for ${goal}` }];
  const p = new Planner({ decomposer: llm }).plan('anything at all');
  assert.equal(p.strategy, 'custom');
  assert.equal(p.steps[0].action, 'llm-step');
});

// ── execution through a runner (the mesh) ─────────────────────────────────
test('planner: executes every step through the mesh and reports completion', async () => {
  const reg = new EngineRegistry();
  reg.register('general', {
    id: 'general',
    canHandle: () => ({ canHandle: true, confidence: 0.5 }),
    run: async (input) => ({ answer: input }),
  });
  const mesh = new MeshRouter(reg);
  const planner = new Planner();

  const result = await planner.execute('analyze Samsung stock',
    async (intent) => (await mesh.route(intent)).result);

  assert.equal(result.strategy, 'finance');
  assert.equal(result.total, 4);
  assert.equal(result.completed, 4);
  assert.ok(result.steps.every((s) => s.ok), 'all steps should succeed');
});

test('planner: a failing step is recorded but does not abort the plan', async () => {
  const planner = new Planner();
  let n = 0;
  // runner throws on the 2nd step only
  const flakyRunner = async () => {
    n++;
    if (n === 2) throw new Error('step 2 failed');
    return 'ok';
  };

  const result = await planner.execute('analyze Samsung stock', flakyRunner);
  // 4 steps attempted, 3 succeeded, 1 failed — but the plan ran to completion
  assert.equal(result.total, 4);
  assert.equal(result.completed, 3);
  const failed = result.steps.find((s) => !s.ok);
  assert.match(failed.error, /step 2 failed/);
});

test('planner: stopOnError halts the plan at the first failure', async () => {
  const planner = new Planner();
  let n = 0;
  const runner = async () => { n++; if (n === 2) throw new Error('boom'); return 'ok'; };

  const result = await planner.execute('analyze Samsung stock', runner, { stopOnError: true });
  // stopped after the failing 2nd step → only 2 attempted
  assert.equal(result.steps.length, 2);
  assert.equal(result.completed, 1);
});
