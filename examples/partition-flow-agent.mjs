// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// examples/partition-flow-agent.mjs — recalled memory (FLUID) → reasoning (FROZEN) under control.
//
//   node examples/partition-flow-agent.mjs
//
// The -PARTITION finding, made concrete: a frozen reasoning region consuming output from a fluid,
// self-modifying memory is the residual cross-partition threat. Here we watch the two sound
// treatments in action — FORBID isolates reasoning from memory; ANCHOR admits only anchor-approved
// memories — with the agent still reasoning cleanly in both cases. Opt-in: drop `partitionFlow` and
// all recalled memory feeds reasoning as before.

import { CogMeshAgent } from '../core/CogMeshAgent.js';
import { WorldModel, WorldSimulator } from '../core/world/index.js';
import { CognitiveMesh, ResourceManager } from '../core/cognition/index.js';
import { createEmbeddingProvider, SemanticRetriever } from '../core/retrieval/index.js';
import { PartitionFlowController, FLOW_POLICY } from '../core/constitution/index.js';

function makeMesh() {
  const world = new WorldModel();
  world.setField('wealth', 100);
  world.setField('risk', 0.3);
  const sim = new WorldSimulator(world, { goalWeights: { wealth: 1, risk: -20 } });
  return new CognitiveMesh({ simulator: sim, resources: new ResourceManager({ maxRollouts: 100000, maxCycles: 4 }) });
}

const { provider } = await createEmbeddingProvider();
async function seededRetriever() {
  const r = new SemanticRetriever(provider);
  await r.add('past goal A → took a risky bet', { anchorApproved: false }); // an unvetted memory
  await r.add('past goal B → a safe, reviewed plan', { anchorApproved: true }); // anchor-approved
  return r;
}

// ---- FORBID: reasoning is isolated from memory ----
{
  const fc = new PartitionFlowController({ partitionTags: { memory: 'FLUID', reasoning: 'FROZEN' } });
  const cog = new CogMeshAgent({ mesh: makeMesh(), retriever: await seededRetriever(), partitionFlow: fc });
  const r = await cog.run('grow the portfolio');
  const pf = r.trace.stages.partitionFlow;
  console.log('[FORBID] policy =', pf.policy, '| recalled', pf.recalledCount, '→ admitted', pf.admittedCount);
  console.log('[FORBID] reasoning still completed, score =', r.trace.stages.think.bestScore);
  console.log('[FORBID] → the frozen planner cannot be steered by any (possibly misaligned) memory.');
}

// ---- ANCHOR: only anchor-approved memories reach reasoning ----
{
  const fc = new PartitionFlowController({
    partitionTags: { memory: 'FLUID', reasoning: 'FROZEN' },
    flowPolicies: { 'memory->reasoning': FLOW_POLICY.ANCHOR },
  });
  const cog = new CogMeshAgent({ mesh: makeMesh(), retriever: await seededRetriever(), partitionFlow: fc });
  const r = await cog.run('grow the portfolio');
  const pf = r.trace.stages.partitionFlow;
  console.log('\n[ANCHOR] policy =', pf.policy, '| recalled', pf.recalledCount, '→ admitted', pf.admittedCount);
  console.log('[ANCHOR] → only the anchor-approved memory may steer the frozen planner.');
}
