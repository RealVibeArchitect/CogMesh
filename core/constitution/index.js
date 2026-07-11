// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/constitution/index.js — public surface of the Constitution runtime.
//
// This is the FIRST CODE implementation of the CONSTITUTION*.md design line (12 design docs). It
// implements the codeable core skeleton from CONSTITUTION-SPEC.md: unforgeable capability tokens,
// the constraint lattice (no loosen), the decision context, the fixed-invariant Frozen Kernel, the
// S1–S5 rule evaluation pipeline, conflict resolution, the append-only governance trajectory, and
// the runtime that composes them.
//
// Deliberately NOT implemented (deferred typed holes, per the design — these were proven hard or
// impossible to decide inside the system, so the code escalates to an external anchor rather than
// faking a decision):
//   - the Frozen Kernel's full invariant CONTENT (W-1 power-increase classifier interior)
//   - the sound static effect-closure / behavior-determining analyzer (S2 interior)
//   - the external anchor's own attestation/custody protocol (W-3)
//   - the cross-partition information-flow discipline
//   - the weighable-principles preference policy (ConflictResolution uses a placeholder ordering)

export { CapabilityMint, verify, consume } from './Capability.js';
export { ConstraintSet } from './ConstraintSet.js';
export { DecisionContext } from './DecisionContext.js';
export { GovernanceTrajectory } from './GovernanceTrajectory.js';
export { FrozenKernel } from './FrozenKernel.js';
export { RuleEvaluationPipeline } from './RuleEvaluationPipeline.js';
export { resolveConflict } from './ConflictResolution.js';
export { Verdict } from './Verdict.js';
export { checkCertificate, APPROVED_TRANSFORMATIONS, registerTransformation } from './ConservativenessCertificate.js';
export { PartitionFlowController, FLOW_POLICY } from './PartitionFlow.js';
export { ExternalAnchor, InProcessAnchor, fromLegacyAuthorize } from './ExternalAnchor.js';
export { ConstitutionRuntime } from './ConstitutionRuntime.js';

// ── S-2 isolation: the adjudicator in its own thread, with wire-safe tokens ──
export { IsolatedAdjudicator } from './IsolatedAdjudicator.js';
export { WireCapabilityMint } from './WireCapability.js';
export { CanaryBattery, DEFAULT_CANARIES } from './CanaryBattery.js';

// ── S-4 semantic tiering: the mechanical floor routes; the semantic tier vetoes ──
export { HarmTaxonomy } from './HarmTaxonomy.js';

// ── S-5 throughput horns: conservative caching + budgeted leases ──
export { VerdictCache, verdictCacheKey } from './VerdictCache.js';

// ── generational oversight: checkable invariants across self-modification lineages ──
export {
  GenerationLineage, checkGenerationStep, generationHash, OVERSIGHT_MECHANISMS,
} from './GenerationalOversight.js';

// ── PAD mood → constitutional tightening (one-way: mood can only make governance stricter) ──
export {
  MoodConstraintPolicy, MOOD_CONSTRAINT_BANDS, moodDeltaFromReasoningParams,
} from './MoodConstraintPolicy.js';
