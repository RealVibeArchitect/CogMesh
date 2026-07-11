// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// test/cogmeshAgent.test.mjs — the whole system, working as one.
//
//   node --test test/cogmeshAgent.test.mjs
//
// Validates that the subsystems compose into a single perceive→remember→think→act→learn
// agent, and — crucially — that the loop CLOSES: a memory written on one run is recalled on
// the next. Also checks graceful degradation when optional subsystems are absent.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { WorldModel, WorldSimulator } from '../core/world/index.js';
import { CognitiveMesh, ResourceManager } from '../core/cognition/index.js';
import { createEmbeddingProvider, SemanticRetriever } from '../core/retrieval/index.js';
import { ToolRegistry, calculatorTool, AgentLoop, rulePolicy } from '../core/agent/index.js';
import { PixelFeatureEncoder } from '../core/multimodal/index.js';
import { CogMeshAgent } from '../core/CogMeshAgent.js';

function makeMesh() {
  const world = new WorldModel();
  world.setField('wealth', 100); world.setField('risk', 0.3);
  const sim = new WorldSimulator(world, { goalWeights: { wealth: 1, risk: -20 } });
  return new CognitiveMesh({ simulator: sim, resources: new ResourceManager({ maxRollouts: 100000, maxCycles: 4 }) });
}

function makeAgent() {
  const tools = new ToolRegistry().register(calculatorTool);
  return new AgentLoop({
    tools,
    policy: rulePolicy([
      { when: (o) => o.step === 0, act: () => ({ type: 'tool', tool: 'calculator', args: { expression: '100 * 1.1' } }) },
      { when: (o) => o.step === 1, act: (o) => ({ type: 'finish', answer: o.lastResult.result.value }) },
    ]),
  });
}

test('cogmesh: mesh-only agent just thinks (graceful minimal config)', async () => {
  const cog = new CogMeshAgent({ mesh: makeMesh() });
  const r = await cog.run('grow the portfolio');
  assert.ok(r.decision, 'produced a decision');
  assert.ok(Number.isFinite(r.bestScore));
  assert.deepEqual(r.recalled, [], 'no retriever → no recall, no error');
  assert.equal(r.answer, null, 'no agent → no action');
});

test('cogmesh: full cycle runs every stage', async () => {
  const { provider } = await createEmbeddingProvider();
  const cog = new CogMeshAgent({
    mesh: makeMesh(),
    retriever: new SemanticRetriever(provider),
    agent: makeAgent(),
  });
  const r = await cog.run('grow the portfolio safely', { act: true });
  assert.ok(r.trace.stages.perceive, 'perceive ran');
  assert.ok(r.trace.stages.remember, 'remember ran');
  assert.ok(r.trace.stages.think, 'think ran');
  assert.ok(r.trace.stages.act, 'act ran');
  assert.ok(r.trace.stages.learn.stored, 'learn stored a memory');
  assert.ok(Number.isFinite(r.answer), 'action produced an answer');
});

test('cogmesh: the LEARN→RECALL loop closes across runs', async () => {
  const { provider } = await createEmbeddingProvider();
  const cog = new CogMeshAgent({
    mesh: makeMesh(),
    retriever: new SemanticRetriever(provider),
    agent: makeAgent(),
    config: { recallK: 3 },
  });
  const r1 = await cog.run('포트폴리오를 안전하게 키우기', { act: true });
  assert.equal(r1.recalled.length, 0, 'first run has nothing to recall');
  assert.ok(r1.trace.stages.learn.stored);

  const r2 = await cog.run('자산을 안전하게 늘리는 방법', { act: true });
  assert.ok(r2.recalled.length > 0, 'recalled a memory written on the previous run');
});

test('cogmesh: perceive handles a multimodal (image) input', async () => {
  const { provider } = await createEmbeddingProvider();
  const cog = new CogMeshAgent({
    mesh: makeMesh(),
    retriever: new SemanticRetriever(provider),
    imageEncoder: new PixelFeatureEncoder(),
  });
  const img = { width: 8, height: 8, data: new Uint8ClampedArray(8 * 8 * 4).fill(200) };
  const r = await cog.run('describe this scene', { image: img });
  assert.equal(r.trace.stages.perceive.modality, 'image');
  assert.equal(r.trace.stages.perceive.hasVector, true);
});

test('cogmesh: recall failures never break the cycle', async () => {
  const brokenRetriever = {
    provider: { embed: async () => { throw new Error('embed down'); } },
    query: async () => { throw new Error('index down'); },
    add: async () => { throw new Error('write down'); },
    _items: new Map(),
  };
  const cog = new CogMeshAgent({ mesh: makeMesh(), retriever: brokenRetriever });
  const r = await cog.run('be resilient');
  assert.ok(r.decision, 'still produced a decision despite a broken retriever');
  assert.deepEqual(r.recalled, [], 'failed recall degraded to empty, no throw');
});

test('cogmesh: stability info propagates to the top level', async () => {
  const cog = new CogMeshAgent({ mesh: makeMesh() });
  const r = await cog.run('grow');
  assert.ok(r.stability, 'stability surfaced at the agent level');
  assert.ok(['improving', 'plateau', 'unstable'].includes(r.stability.trend));
});

// ── Constitution-governed learning (opt-in) ──────────────────────────────

import { ConstitutionRuntime } from '../core/constitution/index.js';

test('governed cogmesh: learning is withheld without an external anchor', async () => {
  const { provider } = await createEmbeddingProvider();
  const cog = new CogMeshAgent({
    mesh: makeMesh(),
    retriever: new SemanticRetriever(provider),
    constitution: new ConstitutionRuntime(),
  });
  const r = await cog.run('remember this outcome');
  // memory formation is behavior-determining → power-increasing → needs external sign-off
  assert.equal(r.trace.stages.learn.stored, false);
  assert.equal(r.trace.stages.learn.withheld, true);
  assert.equal(cog.constitution.attest().chainIntact, true);
});

test('governed cogmesh: learning proceeds when the anchor authorizes it', async () => {
  const { provider } = await createEmbeddingProvider();
  const cog = new CogMeshAgent({
    mesh: makeMesh(),
    retriever: new SemanticRetriever(provider),
    constitution: new ConstitutionRuntime({ externalAnchor: { authorize: () => true } }),
  });
  const r = await cog.run('remember this outcome');
  assert.equal(r.trace.stages.learn.stored, true);
});

test('governed cogmesh: the governance session persists across runs', async () => {
  const { provider } = await createEmbeddingProvider();
  const cog = new CogMeshAgent({
    mesh: makeMesh(),
    retriever: new SemanticRetriever(provider),
    constitution: new ConstitutionRuntime({ externalAnchor: { authorize: () => true } }),
  });
  await cog.run('goal A');
  await cog.run('goal B');
  // one admit + two gated persists (+ their decisions) accumulate in one trajectory
  assert.ok(cog.governanceTrajectory.length >= 3);
});

test('governed cogmesh: without a constitution, learning is unchanged', async () => {
  const { provider } = await createEmbeddingProvider();
  const cog = new CogMeshAgent({ mesh: makeMesh(), retriever: new SemanticRetriever(provider) });
  const r = await cog.run('remember this');
  assert.equal(r.trace.stages.learn.stored, true);
  assert.equal(cog.governanceTrajectory, null);
});

// ── Cross-partition flow: recalled memory (FLUID) → reasoning (FROZEN) ────

import { PartitionFlowController, FLOW_POLICY } from '../core/constitution/index.js';

async function agentWithMemories(partitionFlow) {
  const { provider } = await createEmbeddingProvider();
  const retriever = new SemanticRetriever(provider);
  await retriever.add('past goal A risky', { anchorApproved: false });
  await retriever.add('past goal B safe', { anchorApproved: true });
  return new CogMeshAgent({ mesh: makeMesh(), retriever, partitionFlow });
}

test('partition flow: without a controller, all recalled memory feeds reasoning', async () => {
  const cog = await agentWithMemories(null);
  const r = await cog.run('grow');
  assert.equal(r.trace.stages.partitionFlow, undefined);
});

test('partition flow: FORBID isolates reasoning from memory', async () => {
  const fc = new PartitionFlowController({ partitionTags: { memory: 'FLUID', reasoning: 'FROZEN' } });
  const cog = await agentWithMemories(fc);
  const r = await cog.run('grow');
  assert.equal(r.trace.stages.partitionFlow.policy, 'forbid');
  assert.equal(r.trace.stages.partitionFlow.admittedCount, 0);
  // reasoning still completes even with memory isolated
  assert.ok(r.trace.stages.think.bestScore != null);
});

test('partition flow: ANCHOR admits only anchor-approved memories', async () => {
  const fc = new PartitionFlowController({
    partitionTags: { memory: 'FLUID', reasoning: 'FROZEN' },
    flowPolicies: { 'memory->reasoning': FLOW_POLICY.ANCHOR },
  });
  const cog = await agentWithMemories(fc);
  const r = await cog.run('grow');
  assert.equal(r.trace.stages.partitionFlow.policy, 'anchor');
  assert.equal(r.trace.stages.partitionFlow.recalledCount, 2);
  assert.equal(r.trace.stages.partitionFlow.admittedCount, 1); // only the approved memory
});
