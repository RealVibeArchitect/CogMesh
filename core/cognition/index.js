// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/cognition/index.js — public API for the Brain-like Parallel Cognitive Mesh.
//
// The self-revising cognitive cycle described in the CogMesh AGI design document:
//
//   Generate → Decompose → Parallel Simulation → Evaluation Council (Debate)
//        → Conflict → Synthesis → Regeneration → (repeat) → Self-Improvement
//
// Stages, each independently usable:
//   - DecompositionEngine        split one candidate into many perspective thought-nodes
//   - ParallelWorldSimulation    roll every node into its own future (budget-aware)
//   - EvaluationCouncil          many evaluators judge, then debate & peer-review
//   - evaluators                 council members adapting PAD / confidence / world score
//   - Conflict/Synthesis/Regen   collide top ideas → fuse a new one → feed back
//   - AdaptiveMesh               thought-graph with Hebbian weights (mesh, not tree)
//   - ResourceManager            spend compute where it pays; kill weak branches early
//   - CognitiveMesh              the orchestrator that runs the whole loop

export { DecompositionEngine, makeThoughtNode, DEFAULT_PERSPECTIVES } from './DecompositionEngine.js';
export { ParallelWorldSimulation } from './ParallelWorldSimulation.js';
export { EvaluationCouncil, normalizeVerdict } from './EvaluationCouncil.js';
export {
  buildDefaultCouncil,
  worldEvaluator, logicEvaluator, costEvaluator, confidenceEvaluator,
  makeRiskEvaluator, makePadEvaluator, makeGoalEvaluator,
} from './evaluators.js';
export { ConflictEngine, SynthesisEngine, RegenerationEngine } from './ConflictSynthesis.js';
export { AdaptiveMesh } from './AdaptiveMesh.js';
export { ResourceManager } from './ResourceManager.js';
export { StabilityGuard } from './StabilityGuard.js';
export { RolloutCache } from './RolloutCache.js';
export { AttentionManager, DEFAULT_SALIENCE } from './AttentionManager.js';
export { MetaReasoner, STRATEGIES } from './MetaReasoner.js';
export { WorkerPool, describeSimulator } from './WorkerPool.js';
export { CognitiveMesh } from './CognitiveMesh.js';
