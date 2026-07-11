// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// index.js — the public face of CogMesh.
//
// One import surface for the whole cognitive architecture. Everything here is
// re-exported from the per-domain modules, so both styles work:
//
//   import { CogMeshAgent, CognitiveMesh, WorldSimulator } from 'cogmesh';
//   import { PADState } from 'cogmesh/pad';           // or per-domain subpath
//
// The layers, bottom-up:
//
//   world        WorldModel (state) + WorldSimulator (imagine futures)
//   cognition    the Brain-like Parallel Cognitive Mesh (decompose → simulate →
//                debate → synthesize → regenerate), with attention, meta-reasoning,
//                caching, worker parallelism, resource governance, and stability
//   retrieval    local semantic memory (MiniLM ONNX or lexical fallback) — RAG recall
//   memory       episodic / working / semantic / reflection stores + compression
//   pad          the PAD emotion space: 20-emotion map, state dynamics, metacognition
//   agent        the grounded observe→decide→act tool loop (+ mesh-driven policy)
//   mesh         domain-engine routing with cross-review and mood derivation
//   orchestrator bounded rationality, planning, goals, deliberation, input transform
//   constitution runtime governance: capabilities, rule pipeline, verdicts, anchors
//   multimodal   image/video → shared vector space encoders
//
// CogMeshAgent composes them into one closed perceive→remember→think→act→learn loop.

// ── the integrated agent ────────────────────────────────────────────────────
export { CogMeshAgent } from './core/CogMeshAgent.js';

// ── world: state + imagination ──────────────────────────────────────────────
export { WorldModel, WorldSimulator, CalibrationLedger } from './core/world/index.js';

// ── cognition: the parallel mesh ────────────────────────────────────────────
export {
  CognitiveMesh,
  DecompositionEngine, makeThoughtNode, DEFAULT_PERSPECTIVES,
  ParallelWorldSimulation,
  EvaluationCouncil, normalizeVerdict,
  worldEvaluator, logicEvaluator, costEvaluator, confidenceEvaluator,
  makeRiskEvaluator, makePadEvaluator, makeGoalEvaluator, buildDefaultCouncil,
  ConflictEngine, SynthesisEngine, RegenerationEngine,
  AdaptiveMesh,
  ResourceManager,
  RolloutCache,
  StabilityGuard,
  AttentionManager, DEFAULT_SALIENCE,
  MetaReasoner, STRATEGIES,
  WorkerPool, describeSimulator,
} from './core/cognition/index.js';

// ── retrieval: local semantic recall ────────────────────────────────────────
export {
  cosine, HashingEmbedder, MiniLMEmbedder, createEmbeddingProvider,
  SemanticRetriever,
} from './core/retrieval/index.js';

// ── memory ──────────────────────────────────────────────────────────────────
export {
  WorkingMemory, EpisodeMemory, SemanticMemory, ReflectionMemory,
  compressTurns, Memory,
} from './core/memory/index.js';

// ── PAD emotion layer ───────────────────────────────────────────────────────
export {
  EMOTIONS, EMOTION_BY_ID,
  nearestEmotion, euclideanDistance,
  PADState, blendEmotions,
  synthesize, EMERGENCE_THRESHOLD,
  reflect, toReasoningParams,
} from './core/pad/index.js';

// ── agent loop + tools ──────────────────────────────────────────────────────
export * from './core/agent/index.js';

// ── engine mesh routing ─────────────────────────────────────────────────────
export { EngineRegistry, engineRegistry, MeshRouter, deriveMood } from './core/mesh/index.js';

// ── orchestration ───────────────────────────────────────────────────────────
export {
  allocateBudget, computeCost, computeWorldCost, BUDGET_TIERS,
  transformInput, Planner, TEMPLATES, GoalManager, DeliberativeLoop,
} from './core/orchestrator/index.js';

// ── constitutional governance (incl. S-2 isolation: IsolatedAdjudicator, ──────
//    WireCapabilityMint, CanaryBattery — all flow through this star export) ─────
export * from './core/constitution/index.js';

// ── multimodal encoders ─────────────────────────────────────────────────────
export * from './core/multimodal/index.js';

// ── reflection (confidence + self-correction) ───────────────────────────────
export { assessUncertainty, selfCorrect, UNCERTAINTY_THRESHOLD, estimateConfidence } from './core/reflection/index.js';
