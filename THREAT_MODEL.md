<!--
SPDX-License-Identifier: AGPL-3.0-or-later
CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
-->

# CogMesh Threat Model

> **Purpose.** A threat model states three things plainly: **what the system tries to prevent**,
> **what it cannot prevent**, and **what it assumes**. This document does that for CogMesh across two
> layers: the *implemented library* (the code that exists and passes tests today) and the *Constitution
> governance architecture* (the design line in `CONSTITUTION*.md`, which is architecture, not yet code).
>
> **Honesty principle.** A threat model earns trust by what it admits it *cannot* do. Overstating
> coverage is the classic false-confidence failure. Where the answer is "we cannot prevent this," this
> document says so directly rather than implying protection that does not exist. Much of the value here
> is in §3 (what we cannot prevent) and §4 (assumptions), not §2 (what we defend).

---

## 0. Three layers, three maturities

CogMesh has three distinct security postures, and conflating them would be dishonest:

| Layer | Status | Security posture |
|-------|--------|------------------|
| **Implemented library** (`core/`, tests passing) | real, runnable | a research/experimental cognition library; **not a hardened runtime** |
| **Implemented governance core** (`core/constitution/`, `core/world/CalibrationLedger.js`) | real, runnable, adversarially tested | the S-1–S-5 mechanisms below run in code, are wired into `AgentLoop`, and are backed by a mutation harness (18/18) + adversarial simulations; **still not a formal proof of safety** |
| **Open governance frontier** (`CONSTITUTION*.md` §13) | field-open problem | the *semantic* half of oversight — verifying a self-modification preserves what the checkable invariants cannot see — remains unsolved, by honest design |

The middle row is what changed since this document was first written. The findings the constitution
review ranked most serious (S-1 oracle bounding, S-2 adjudicator isolation, S-3 evaluator competence,
S-4 semantic-vs-mechanical enforcement, S-5 report-up scalability) are **no longer design-only**: they
are enforced by running code in `core/constitution/`, composed end-to-end through a governed
`AgentLoop` (see `test/governanceIntegration.test.mjs`), and stress-tested by `npm run mutation`
(18 sabotage mutations, 18 killed), `npm run sim:generational` (200-generation adversarial lineage,
0 erosions admitted), and `npm run redteam` (500 adversarial self-mod proposals, 0 escapes — after
its first run found and closed a real forged-proof hole).

What remains genuinely open is the top row's opposite — §13's semantic frontier — and the assumptions
in §4. When this threat model says "the governance core prevents X," it now means *running, tested
code enforces X under the §4 assumptions* — not "the design intends to."

---

## 1. What is CogMesh trying to protect, and against whom?

**Assets (what must not be compromised):**
- The **integrity of the reasoning loop** — that imagination stays imagination (branched world, never
  reality) and the loop always terminates.
- The **soundness of self-improvement governance** — that the system cannot improve itself into
  something unsafe, and cannot edit away its own oversight.
- The **grounding boundary** — that the system acts on the world only through governed, authorized
  capabilities.

**Adversaries (who might compromise them):**
- **A crafted input** — malicious text/image/data designed to steer goal formation, poison memory, or
  *manipulate affect* (an input engineered to drive the PAD mood toward a state the attacker wants).
  The mood-governance coupling is deliberately built so this last vector is a dead end: mood can only
  make governance stricter, so the worst an affect-manipulating input achieves is excess caution.
- **A compromised or misaligned internal module** — a sub-component (especially a *learned* one) that
  behaves against the system's interest, whether through corruption, adversarial training data, or
  emergent misalignment.
- **The self-improving system itself** — the deepest adversary: a future, more-capable version that
  might (deliberately or not) act to escape its own governance. Most of the governance core exists
  to address *this* adversary, which is why it is so much harder than the others. The `redteam`
  proposer harness models exactly this adversary and measures escapes.
- **The host/operator context** — out of scope as an adversary in most of this model (see §4), but
  named because the trust boundary must be explicit.

---

## 2. What CogMesh is designed to prevent (and by which mechanism)

### 2.1 Implemented library — what the code actually enforces today

- **Runaway reasoning / non-termination.** The `ResourceManager` bounds cycles/rollouts/wall-clock;
  the `StabilityGuard` detects plateaus and stops. *Enforced in code.*
- **Poisoned candidates propagating.** `StabilityGuard.sanitize` isolates NaN/Infinity candidates
  before ranking/synthesis. *Enforced in code (tested).*
- **Imagination mutating reality.** Rollouts run on `world.branch()`; the live World Model is
  read-only during simulation. *Enforced by construction.*
- **Unbounded tool use.** `AgentLoop` is step-bounded and fault-tolerant; a `safeOnly` mode restricts
  to side-effect-free tools; a failing tool becomes an observation, not a crash. *Enforced in code.*
- **JS↔Python PAD drift.** `check-pad-sync` fails CI if the two coordinate sources diverge. *Enforced
  in CI.*

### 2.2 Governance core — what the code now enforces (with the mechanism + its evidence)

Each item below is running code in `core/constitution/` (or `core/world/` for S-1), composed through
a governed `AgentLoop`, with named tests and adversarial harnesses as evidence. This is the row that
moved from "design" to "enforced" since the first draft of this document.

- **Ungoverned action.** No action executes without an unforgeable, adjudicator-minted capability
  token. Tokens crossing the worker boundary are HMAC-signed plain data (`WireCapability.js`); the
  mint secret never leaves the adjudicator worker. *Enforced — `test/isolatedAdjudicator.test.mjs`,
  and the mutation harness kills a "make every signature valid" mutant.*
- **S-2 · Adjudicator isolation (the golden invariant).** The adjudicator runs in a dedicated worker
  that solely owns the kernel, mint secret, trajectory, and sessions (`IsolatedAdjudicator.js` +
  `AdjudicatorWorker.mjs`). Killing it yields **paralysis, not freedom** — no token can be minted or
  redeemed, so every governed effect halts. *Enforced, tested at the agent level:
  `test/governanceIntegration.test.mjs` "a dead adjudicator paralyzes the agent."*
- **S-3 · Self-modification bypassing oversight.** Every self-mod passes two independent checks: a
  **ground-truth** harm check (the modification's actual canary-class nature — a proof cannot launder
  the change) and an **evaluator-competence** check against a held-out canary battery
  (`CanaryBattery.js`). Missing a canary freezes self-mod with no self-unfreeze (anchor-only).
  *Enforced — `test/redteamSelfMod.test.mjs`; `npm run redteam` finds 0/500 escapes after closing the
  forged-proof hole its first run exposed.*
- **S-1 · Oracle bounding for irreversible actions.** An irreversible action justified by an oracle
  prediction may rely on that oracle only for an action class with a measured, well-calibrated,
  tamper-evident track record (`CalibrationLedger.js`, hash-chained). No record / too few samples /
  poor score / broken chain ⇒ escalate to the external anchor. The loop is closed via
  `recordOutcome`. *Enforced — `test/calibrationGate.test.mjs`; the mutation harness kills an
  "unknown class trusted" mutant.*
- **S-4 · Semantic-vs-mechanical enforcement.** A mechanical floor (`HarmTaxonomy.js`) *routes*
  (forbidden ⇒ fast deny, registered-safe-in-bounds ⇒ fast pass, tagged/unregistered ⇒ semantic
  review); the semantic tier is **veto-only** (final = pipeline ∧ semantic). Deny wins everywhere; a
  missing evaluator, an error, or a blown deadline all fail closed. *Enforced —
  `test/semanticTiering.test.mjs`; mutants that flip the fail-closed defaults are killed.*
- **S-5 · Report-up scalability without a soundness hole.** The horn is picked per class and priced:
  irreversible classes pay full per-action review; provably-conservative classes use an epoch-keyed
  cache and budgeted leases. Both shortcuts are sound by construction — a stale cache entry may only
  **deny**, never allow, and leases die with the adjudicator. *Enforced — `test/scalability.test.mjs`;
  `npm run bench:governance` reports the numbers; mutants breaking the asymmetries are killed.*
- **History forgery / trajectory laundering.** Append-only, hash-chained Governance Trajectory;
  tampering breaks integrity and reads fail closed. *Enforced — kernel INV checks + chain verification
  in the constitution suite.*
- **Generational oversight erosion.** Across a lineage of accepted self-modifications, six checkable
  invariants (`GenerationalOversight.js`, G-1..G-6) forbid lowering the safety floor, removing an
  oversight mechanism, regressing competence, raising the power ceiling without anchor authorization,
  breaking lineage accountability, or dropping the rollback path. *Enforced — 
  `test/generationalOversight.test.mjs`; `npm run sim:generational` admits 0 erosions across 200
  adversarial generations.*
- **Affective state as an attack surface.** The PAD mood signal can influence governance, but only in
  the safe direction: heightened caution ADDS weighable constraints and, at the extreme, revokes the
  pipeline's "plain action is conservative by default" trust (forcing a proof-or-escalate)
  (`MoodConstraintPolicy.js` + the `demandConservativenessProof` path in the pipeline). Mood can
  **never** touch the inviolable floor, loosen a constraint, or rescue a HALT — so inducing a mood is
  not an attack on safety (its worst case is excess caution, a liveness cost). Every mood-influenced
  decision is recorded on the tamper-evident trajectory for audit. *Enforced —
  `test/moodGovernance.test.mjs`; the mutation harness kills both a "mood injects an inviolable" mutant
  and a "ignore the extreme-caution proof demand" mutant.*

---

## 3. What CogMesh **cannot** prevent (stated plainly)

This is the most important section. These are not bugs to be fixed later; several are *structural
limits* established by the Constitution review line itself.

### 3.1 Implemented-library limits (it is not a hardened runtime)

- **A malicious host or process.** CogMesh runs in-process; a compromised host OS, a malicious
  dependency, or code with the same process privileges can bypass everything. The library assumes a
  trusted execution environment.
- **Adversarial real-world tools.** The core ships only pure/safe built-in tools; real tools (network,
  filesystem, APIs) are supplied by the host and are **outside** the governed boundary. A malicious or
  buggy host-supplied tool can do harm the library cannot see or stop.
- **Low-quality / misaligned model outputs.** The library governs *structure* (termination, bounds,
  poison isolation), not *semantic correctness*. It cannot prevent a well-formed but wrong or biased
  decision.
- **Prompt/goal manipulation at the semantic level.** Nothing in the current code deeply vets the
  *meaning* of a goal; a cleverly-worded goal is not blocked by structural checks.

### 3.2 Structural limits established by the Constitution review (cannot be designed away)

These come from the adversarial review line (`CONSTITUTION-REVIEW*.md`, `-KERNEL`, `-RESIDUES`,
`-COVERAGE`, `-TERMINATION`, `-CONVERGENCE`, `-PARTITION`) and are limits *in principle*, not gaps in
effort:

- **The behavior-in-reach blind spot (from -TERMINATION).** A change that holds *reach* fixed but
  alters *behavior-determining state* (a learned-weight update) cannot be statically certified safe;
  it must be externally anchored. **The system cannot autonomously and soundly self-certify a learning
  update.** Learning is safe only if externally signed off.
- **No safe open-ended autonomous self-improvement (from -CONVERGENCE).** Safety and open-ended
  autonomous self-improvement **do not overlap**. A sufficiently self-modifying system cannot be both
  safe and autonomously self-improving; soundness forces every boundary-fluid change to be anchored.
  This is a dichotomy, not a tunable dial. CogMesh cannot give you both; it can only let you *partition*
  which regions are frozen (autonomous, safe) vs. fluid (anchored).
- **Cross-partition information flow (from -PARTITION).** Wherever a frozen, trusted region consumes
  output from a fluid, self-modifying region, the frozen region's safety is contingent on that output.
  Freezing the consumer's *code* does not remove the contingency. This can be *bounded* (forbid the
  flow, or anchor it) but **not eliminated**. It is a standing, unmitigated risk whose management is a
  deployment choice.
- **The irreducible external dependency (from -RESIDUES / -CERTIFICATES).** The system cannot be fully
  self-sufficient. It must defer to an **external anchor** for two things: the identity of its own
  kernel (the trust root — a passive reference) and the growth of its own power (catalog curation — an
  active authority). **CogMesh cannot bootstrap its own trustworthiness from inside itself.** Something
  outside must be trusted; the architecture only minimizes and declares it, never removes it.
- **The power-increase classifier's residue (from -CERTIFICATES / -COVERAGE).** Classifying a change as
  power-increasing can be made *sound* (never a false "safe") but not *complete* (it will over-flag,
  refusing some safe changes). At the limit this makes a strongly-self-modifying system inert. The
  safety is real; the cost (lost autonomy) is also real and cannot be argued away.

### 3.3 The honest one-line summary of §3

> **CogMesh can keep its reasoning loop sound and its actions governed, and it can make unsafe self-
> improvement *detectable and blockable* — but it cannot give a strongly self-modifying system safe
> autonomy, cannot certify learning without external sign-off, cannot isolate a trusted region that
> listens to an untrusted one, and cannot root its own trust from within. These are limits of the
> problem, not of the implementation.**

---

## 4. Assumptions (what must hold for the guarantees to mean anything)

Every guarantee above is conditional on these. If an assumption fails, the guarantee it supports fails
with it.

### 4.1 Environment assumptions
- **Trusted execution environment.** The process, OS, hardware, and dependencies running CogMesh are
  not themselves adversarial. CogMesh does not defend against a compromised host.
- **Honest external anchor.** The external anchor (trust reference + power authority, §3.2) is
  faithfully held and operated (ultimately by humans/institutions). If the anchor is corrupted or
  colludes, the governance it roots is void. This is the single most load-bearing trust assumption.
- **Faithful implementation.** The Constitution guarantees assume a future implementation faithfully
  realizes the architecture. Today they are design claims; an unfaithful implementation voids them.

### 4.2 Architectural assumptions
- **Explicit, design-time partition.** The frozen/fluid boundary is declared explicitly and fixed at
  design time. A system that tries to infer its own partition at run time re-inherits the full
  circularity and the guarantees collapse (from -PARTITION §2).
- **Sound static analyses.** The kernel's checks (token validity, staging provenance, trajectory-chain
  integrity, effect-closure coverage, behavior-determining tagging) are assumed *sound* (never a false
  negative), achieved by conservative over-approximation. Their soundness is assumed; a bug in a static
  check is a hole in the floor.
- **Behavior-determining state is soundly taggable.** The classification "this state can affect
  behavior" over-approximates safely (unsure ⇒ tagged). If this tagging is unsound, learning updates
  can slip through unanchored (the -TERMINATION hole).
- **The Frozen Kernel is genuine and minimal.** Its one-time verification and tamper-evident
  attestation are trusted (the W-3 residue). Nothing inside the system can verify its own kernel; this
  is taken on faith at the external anchor.

### 4.3 Scope assumptions (deliberately out of scope)
- Side channels (timing, power, EM) — out of scope; this is an architecture, not a hardened
  implementation.
- The correctness/alignment of *human* operators of the external anchor — assumed, not modeled.
- Multi-instance / distributed collusion beyond the single-anchor model — not yet modeled (noted in
  the scaling discussion, not resolved).

---

## 5. Relationship to SECURITY.md

[SECURITY.md](SECURITY.md) covers **vulnerability reporting and the implemented library's security
scope** (how to report, what is in/out of scope for the *code*). This document covers the **threat
model** — the reasoning about assets, adversaries, structural limits, and assumptions across the
implemented library, the now-implemented governance core, and the open semantic frontier. SECURITY.md
answers "how do I report a hole?"; THREAT_MODEL.md answers "what is the system trying to do, what
can't it do, and what does it assume?"

**A concrete link between the two:** the governance core ships an in-repo adversarial harness
(`npm run redteam`) whose entire job is to *find* self-modification escapes, and it already found one
(a forged full-battery proof) that was then fixed and locked with a regression test. That is the
model this project wants for governance holes: an adversarial finder, a located failure, a fix, and a
test — reported through the SECURITY.md process when found by others. A governance escape (a genuinely
harmful action or self-modification that the core admits under the §4 assumptions) is exactly the
class of vulnerability SECURITY.md asks you to report privately.

---

## 6. Summary table

| Question | Answer (shortest honest form) |
|----------|-------------------------------|
| **What do we prevent?** | Runaway/poisoned reasoning and ungoverned action (code, today); unsafe self-modification, oracle over-trust for irreversible bets, generational oversight erosion, and affect-manipulation-as-an-attack (mood can only tighten) (code, today — S-1..S-5 + G-1..G-6 + mood coupling, wired into `AgentLoop`, mutation- and adversarially-tested). |
| **What can't we prevent?** | The *semantic* half of oversight (§13 — verifying a change preserves what the invariants can't see); safe open-ended autonomous self-improvement (impossible); learning without external sign-off; cross-partition contamination; self-rooted trust; a compromised host; novel harm classes outside the canary battery. |
| **What do we assume?** | Trusted execution environment; an honest, faithfully-operated external anchor; explicit design-time partition; sound static checks; a faithful sandbox analysis deriving a modification's true nature. |

The shortest true statement of CogMesh's security stance:

> **CogMesh makes unsafe cognition and unsafe self-improvement *detectable and blockable* under stated
> assumptions — the S-1..S-5 mechanisms now enforce this in running, adversarially-tested code — but it
> does not make a strongly self-improving system safely autonomous, because the review line proved that
> is not available to anyone, and it says so rather than pretending otherwise.**
