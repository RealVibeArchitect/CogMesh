// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// examples/governed-cogmesh.mjs — the FULL perceive→remember→think→act→learn loop under governance.
//
//   node examples/governed-cogmesh.mjs
//
// This is the culmination of the Constitution line: the abstract finding from CONSTITUTION-TERMINATION.md
// — "a memory write changes behavior-determining state, so learning is power-increasing and needs
// external sign-off" — is now an ACTUAL RUNTIME BEHAVIOR. Watch the LEARN step be withheld without an
// anchor, and proceed with one. Governance is opt-in; drop `constitution` and the agent learns freely.

import { CogMeshAgent } from '../core/CogMeshAgent.js';
import { WorldModel, WorldSimulator } from '../core/world/index.js';
import { CognitiveMesh, ResourceManager } from '../core/cognition/index.js';
import { createEmbeddingProvider, SemanticRetriever } from '../core/retrieval/index.js';
import { ConstitutionRuntime } from '../core/constitution/index.js';

function makeMesh() {
  const world = new WorldModel();
  world.setField('wealth', 100);
  world.setField('risk', 0.3);
  const sim = new WorldSimulator(world, { goalWeights: { wealth: 1, risk: -20 } });
  return new CognitiveMesh({ simulator: sim, resources: new ResourceManager({ maxRollouts: 100000, maxCycles: 4 }) });
}

const { provider } = await createEmbeddingProvider();

// ---- 1. governed, NO external anchor: the learn step is withheld ----
{
  const cog = new CogMeshAgent({
    mesh: makeMesh(),
    retriever: new SemanticRetriever(provider),
    constitution: new ConstitutionRuntime(),
  });
  const r = await cog.run('grow the portfolio carefully');
  const learn = r.trace.stages.learn;
  console.log('[no-anchor] learn withheld =', learn.withheld === true, '| verdict =', learn.verdict);
  console.log('[no-anchor] reason:', learn.reason);
  console.log('[no-anchor] → learning requires external sign-off, exactly as the review proved.');
}

// ---- 2. governed, WITH an anchor that authorizes: the learn step proceeds ----
{
  const cog = new CogMeshAgent({
    mesh: makeMesh(),
    retriever: new SemanticRetriever(provider),
    constitution: new ConstitutionRuntime({ externalAnchor: { authorize: () => true } }),
  });
  const r1 = await cog.run('grow the portfolio carefully');
  const r2 = await cog.run('grow the portfolio again');
  console.log('\n[anchored] run 1 stored =', r1.trace.stages.learn.stored, '| run 2 stored =', r2.trace.stages.learn.stored);
  console.log('[anchored] trajectory events across both runs =', cog.governanceTrajectory.length);
  console.log('[anchored] chain intact =', cog.constitution.attest().chainIntact);
  console.log('[anchored] → with sign-off, the agent learns and every write is on the audit trail.');
}
