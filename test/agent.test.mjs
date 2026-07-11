// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// test/agent.test.mjs — real-world grounding: tools + the agent loop.
//
//   node --test test/agent.test.mjs
//
// All tools here are pure/deterministic, so the loop is fully verifiable offline. The
// contract: correct multi-step tool use, bounded termination, fault tolerance, safe-mode
// enforcement, and the policy seam (rule-based + mesh-style routing).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ToolRegistry, defineTool, calculatorTool, makeMemoTool, evalArithmetic,
  AgentLoop, rulePolicy, meshPolicy,
} from '../core/agent/index.js';

test('tool: calculator evaluates arithmetic without eval', () => {
  assert.equal(evalArithmetic('2 * (3 + 4)'), 14);
  assert.equal(evalArithmetic('10 / 2 - 3'), 2);
  assert.ok(Number.isNaN(evalArithmetic('2 +')));
});

test('registry: register, invoke, and error envelope', async () => {
  const tools = new ToolRegistry().register(calculatorTool);
  const ok = await tools.invoke('calculator', { expression: '6*7' });
  assert.equal(ok.ok, true);
  assert.equal(ok.result.value, 42);
  const miss = await tools.invoke('nope', {});
  assert.equal(miss.ok, false);
  assert.match(miss.error, /unknown tool/);
});

test('registry: a throwing tool becomes an error envelope, not a crash', async () => {
  const tools = new ToolRegistry().register(defineTool({
    name: 'boom', description: 'always throws', run: () => { throw new Error('kaboom'); },
  }));
  const r = await tools.invoke('boom', {});
  assert.equal(r.ok, false);
  assert.match(r.error, /kaboom/);
});

test('registry: catalog lists tools with safe tags', () => {
  const tools = new ToolRegistry().register(calculatorTool).register(makeMemoTool());
  const cat = tools.catalog();
  assert.match(cat, /calculator/);
  assert.match(cat, /\[safe\]/);
});

test('agent: multi-step tool use feeds results forward', async () => {
  const tools = new ToolRegistry().register(calculatorTool);
  const policy = rulePolicy([
    { when: (o) => o.step === 0, act: () => ({ type: 'tool', tool: 'calculator', args: { expression: '3 + 4' } }) },
    { when: (o) => o.step === 1 && o.lastResult?.ok,
      act: (o) => ({ type: 'tool', tool: 'calculator', args: { expression: `${o.lastResult.result.value} * 10` } }) },
    { when: (o) => o.step === 2, act: (o) => ({ type: 'finish', answer: o.lastResult.result.value }) },
  ]);
  const agent = new AgentLoop({ tools, policy, config: { maxSteps: 5 } });
  const r = await agent.run('(3+4)*10');
  assert.equal(r.answer, 70, 'chained two tool calls to the right answer');
  assert.equal(r.done, true);
  assert.equal(r.steps, 3);
});

test('agent: bounded — never exceeds maxSteps', async () => {
  const tools = new ToolRegistry().register(calculatorTool);
  const neverStops = () => ({ type: 'tool', tool: 'calculator', args: { expression: '1+1' } });
  const agent = new AgentLoop({ tools, policy: neverStops, config: { maxSteps: 3 } });
  const r = await agent.run('loop forever');
  assert.equal(r.steps, 3);
  assert.equal(r.stopReason, 'step budget exhausted');
  assert.equal(r.done, false);
});

test('agent: fault-tolerant — a failed tool becomes an observation', async () => {
  const tools = new ToolRegistry()
    .register(defineTool({ name: 'flaky', description: 'fails once', run: () => { throw new Error('nope'); } }))
    .register(calculatorTool);
  const policy = rulePolicy([
    { when: (o) => o.step === 0, act: () => ({ type: 'tool', tool: 'flaky' }) },
    // react to the failure by switching tools
    { when: (o) => o.step === 1 && o.lastResult && !o.lastResult.ok,
      act: () => ({ type: 'tool', tool: 'calculator', args: { expression: '2+2' } }) },
    { when: (o) => o.step === 2, act: (o) => ({ type: 'finish', answer: o.lastResult.result.value }) },
  ]);
  const agent = new AgentLoop({ tools, policy, config: { maxSteps: 5 } });
  const r = await agent.run('recover from a tool failure');
  assert.equal(r.answer, 4, 'recovered after the failing tool');
  assert.equal(r.trace[0].result.ok, false, 'failure captured in the trace');
});

test('agent: safe-only mode blocks unsafe tools', async () => {
  const tools = new ToolRegistry()
    .register(defineTool({ name: 'danger', description: 'side effects', safe: false, run: () => ({ did: 'harm' }) }));
  const policy = rulePolicy([
    { when: (o) => o.step === 0, act: () => ({ type: 'tool', tool: 'danger' }) },
    { when: (o) => o.step >= 1, act: () => ({ type: 'finish', answer: 'stopped' }) },
  ]);
  const agent = new AgentLoop({ tools, policy, config: { maxSteps: 3, safeOnly: true } });
  const r = await agent.run('try something unsafe');
  assert.equal(r.trace[0].result.ok, false);
  assert.match(r.trace[0].result.error, /blocked/);
});

test('meshPolicy: routes a goal to the best-matching tool', async () => {
  const tools = new ToolRegistry()
    .register(calculatorTool)
    .register(defineTool({ name: 'weather', description: 'get current weather temperature forecast', safe: true, run: () => ({ temp: 20 }) }));
  const policy = meshPolicy({ tools, config: { maxToolRepeats: 1 } });
  const agent = new AgentLoop({ tools, policy, config: { maxSteps: 4 } });
  const r = await agent.run('calculate an arithmetic expression');
  const picked = r.trace.find((t) => t.decision.type === 'tool')?.decision.tool;
  assert.equal(picked, 'calculator', 'routed to the calculator by description overlap');
});

test('meshPolicy: finishes when no fresh tools remain', async () => {
  const tools = new ToolRegistry().register(calculatorTool);
  const policy = meshPolicy({ tools, config: { maxToolRepeats: 1 } });
  const agent = new AgentLoop({ tools, policy, config: { maxSteps: 5 } });
  const r = await agent.run('calculate 1+1');
  assert.equal(r.done, true, 'terminates rather than looping on one tool');
  assert.ok(r.steps <= 5);
});

// ── Constitution-governed agent loop (opt-in governance) ──────────────────

import { ConstitutionRuntime } from '../core/constitution/index.js';

test('governed loop: without a constitution, behaves exactly as before', async () => {
  const tools = new ToolRegistry().register(calculatorTool);
  const agent = new AgentLoop({
    tools,
    policy: rulePolicy([
      { when: (o) => o.step === 0, act: () => ({ type: 'tool', tool: 'calculator', args: { expression: '6*7' } }) },
      { when: (o) => o.step > 0, act: (o) => ({ type: 'finish', answer: o.lastResult?.result }) },
    ]),
  });
  const r = await agent.run('compute');
  assert.equal(r.governed, false);
  assert.deepEqual(r.answer, { value: 42 });
});

test('governed loop: a normal tool call is permitted and executes', async () => {
  const tools = new ToolRegistry().register(calculatorTool);
  const rt = new ConstitutionRuntime();
  const agent = new AgentLoop({
    tools,
    constitution: rt,
    policy: rulePolicy([
      { when: (o) => o.step === 0, act: () => ({ type: 'tool', tool: 'calculator', args: { expression: '6*7' } }) },
      { when: (o) => o.step > 0, act: (o) => ({ type: 'finish', answer: o.lastResult?.result }) },
    ]),
  });
  const r = await agent.run('compute');
  assert.equal(r.governed, true);
  assert.deepEqual(r.answer, { value: 42 });
  assert.ok(rt.trajectory.length >= 2, 'admit + decision recorded to trajectory');
  assert.equal(rt.attest().chainIntact, true);
});

test('governed loop: a blocked tool call becomes an observation, not a crash', async () => {
  // sequence attack: read a sensitive domain, then use an outbound effector → S4 blocks the second
  const readSecret = defineTool({ name: 'read-private-location', description: 'x', safe: true, run: () => ({ loc: 'home' }) });
  const sendOut = defineTool({ name: 'send', description: 'x', safe: false, run: () => ({ sent: true }) });
  const tools = new ToolRegistry().register(readSecret).register(sendOut);
  const rt = new ConstitutionRuntime();
  const agent = new AgentLoop({
    tools,
    constitution: rt,
    policy: rulePolicy([
      { when: (o) => o.step === 0, act: () => ({ type: 'tool', tool: 'read-private-location', args: {} }) },
      { when: (o) => o.step === 1, act: () => ({ type: 'tool', tool: 'send', args: {} }) },
      { when: (o) => o.step > 1, act: (o) => ({ type: 'finish', answer: o.lastResult }) },
    ]),
  });
  const r = await agent.run('exfiltrate');
  const blocked = r.trace.find((t) => t.result?.constitutionalVerdict === 'HALT');
  assert.ok(blocked, 'the outbound step was blocked by the accumulated-exposure gate');
  assert.match(blocked.result.error, /constitution/);
  assert.equal(r.done, true, 'the loop continued past the block and finished cleanly');
});

test('governed loop: declared tool exposure drives the sequence gate', async () => {
  // exposure is DECLARED by the tools, not inferred from names
  const geo = defineTool({ name: 'geo', description: 'loc', safe: true, exposure: { reads: ['sensitive:location'] }, run: () => ({ loc: 'home' }) });
  const post = defineTool({ name: 'post', description: 'send', safe: false, exposure: { effects: ['outbound:http'] }, run: () => ({ ok: true }) });
  const tools = new ToolRegistry().register(geo).register(post);
  const rt = new ConstitutionRuntime();
  const agent = new AgentLoop({
    tools,
    constitution: rt,
    policy: rulePolicy([
      { when: (o) => o.step === 0, act: () => ({ type: 'tool', tool: 'geo', args: {} }) },
      { when: (o) => o.step === 1, act: () => ({ type: 'tool', tool: 'post', args: {} }) },
      { when: (o) => o.step > 1, act: () => ({ type: 'finish', answer: 'done' }) },
    ]),
  });
  const r = await agent.run('read then send');
  const blocked = r.trace.find((t) => t.result?.constitutionalVerdict === 'HALT');
  assert.ok(blocked, 'declared sensitive-read + outbound-effect is blocked by S4');
});

test('tool: exposure is normalized and optional', () => {
  const withExp = defineTool({ name: 'a', run: () => 1, exposure: { reads: ['x'], effects: ['y'] } });
  assert.deepEqual(withExp.exposure, { reads: ['x'], effects: ['y'] });
  const without = defineTool({ name: 'b', run: () => 1 });
  assert.equal(without.exposure, null);
});
