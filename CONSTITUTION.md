<!--
SPDX-License-Identifier: AGPL-3.0-or-later
CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
-->

# CogMesh Constitution — Architecture Design

> **Status:** architecture only. This document defines the *structure, hierarchy, data flow,
> and enforcement model* of the Constitution layer. It deliberately contains **no
> constitutional articles and no algorithms** — those are designed after this architecture
> is finalized.

The Constitution is the **highest governing layer** of CogMesh. It sits above every
cognitive module — Safety Kernel, PAD, World Model, Memory, Planner, Specialist Engines,
Tool Router, Learning, Self-Improvement, and any future module. Nothing in CogMesh reasons,
plans, acts, learns, or modifies itself except under the Constitution.

Crucially, the Constitution is **not an output filter**. It is the *first* decision-making
layer, consulted **before reasoning begins**, and it stays active through the entire
cognitive loop — including a mandatory re-check before any irreversible action.

---

## 1. Why the Constitution sits above every cognitive module

A safety layer bolted on at the end can only *reject* finished outputs. By then the system
has already reasoned, formed intentions, possibly called tools, and updated memory — the
harmful computation already happened, and its side effects may already exist. CogMesh's
answer is to invert the order: **govern intention before cognition, not just output after
it.**

Four architectural reasons the Constitution must be the top layer:

1. **Pre-cognitive governance.** Some requests should never be reasoned about at all. The
   Constitution decides *whether and how* a goal may be pursued before the mesh spends a
   single rollout on it. Reasoning is a privilege the Constitution grants, not a default.

2. **Uniform inheritance.** If governance lived inside each module, every module — and every
   *future* module — would re-implement it, inconsistently. By placing it above all modules
   as a layer they call *through*, every subsystem inherits the same constraints by
   construction (see §7, Inheritance).

3. **Irreversibility control.** Thinking is reversible; acting on the world and rewriting
   the self are not. The Constitution is the one layer positioned to gate the transition
   from reversible cognition to irreversible action — and it does so at *every* such
   boundary, not once at the start.

4. **Self-modification safety.** A system that can improve itself can improve itself into
   something unsafe. Only a layer that is *above* the learning and self-modification
   machinery — and that validates changes before they activate — can prevent the system
   from editing away its own guardrails (see §8, Self-Modification).

The Constitution is distinct from the **Safety Kernel** (see §4). The Constitution is the
*governing intent* — the principles and the authority to permit/deny/constrain. The Safety
Kernel is the *mechanism* — a fast, narrow, non-bypassable enforcer that executes the
Constitution's hard limits. Constitution = law; Safety Kernel = the immovable floor beneath
the law.

---

## 2. Layer hierarchy

The document hierarchy is reorganized so the Constitution governs everything. Every module
below explicitly operates *under* the layer above it.

```
┌─────────────────────────────────────────────────────────────────────┐
│  L0  CONSTITUTION  — highest governing layer                          │
│      • grants/denies/constrains the right to reason, act, learn, edit │
│      • active before, during, and after every cognitive process       │
│      • the only layer that can authorize irreversible actions         │
└───────────────────────────────┬─────────────────────────────────────┘
                                 │ governs
┌───────────────────────────────▼─────────────────────────────────────┐
│  L1  SAFETY KERNEL  — non-bypassable enforcement mechanism            │
│      • executes the Constitution's hard limits (the immovable floor)  │
│      • fast, narrow, always-on; cannot be disabled by lower layers    │
└───────────────────────────────┬─────────────────────────────────────┘
                                 │ constrains
┌───────────────────────────────▼─────────────────────────────────────┐
│  L2  METACOGNITION  — how to think, under governance                  │
│      • Meta-Reasoner (strategy) · PAD (emotional stance) · Attention  │
│      • Bounded Rationality (budget) · Stability Guard                  │
└───────────────────────────────┬─────────────────────────────────────┘
                                 │ directs
┌───────────────────────────────▼─────────────────────────────────────┐
│  L3  COGNITION  — the reasoning substrate                             │
│      • Goal Formation · World Model · Planner · Cognitive Mesh         │
│      • Specialist Engines · Evaluation Council                         │
└───────────────────────────────┬─────────────────────────────────────┘
                                 │ requests
┌───────────────────────────────▼─────────────────────────────────────┐
│  L4  GROUNDING  — contact with the world                              │
│      • Tool Router / Tool Execution · Multimodal Perception           │
└───────────────────────────────┬─────────────────────────────────────┘
                                 │ records
┌───────────────────────────────▼─────────────────────────────────────┐
│  L5  MEMORY & LEARNING  — persistence and change                      │
│      • Memory (tiered) · Semantic Retrieval · Learning                │
│      • Self-Improvement / Self-Modification                           │
└─────────────────────────────────────────────────────────────────────┘

        ▲                                                    │
        └──────────  every layer reports UP to L0  ──────────┘
             before any irreversible action or self-change
```

Two directions of authority:

- **Downward (authorization):** L0 → L5. Each layer may only do what the layer above has
  authorized. The Constitution's decisions flow down as *constraints* attached to the
  cognitive context.
- **Upward (accountability):** L5 → L0. Before any irreversible step, the acting module
  reports *up* to the Constitution for a go/no-go. The Constitution is never merely a
  gatekeeper at the entrance; it is a standing authority throughout.

---

## 3. System diagram — control flow with the Constitution as the top layer

The complete flow from user input to final action. The Constitution appears **more than
once**: as the first decision layer, as a standing supervisor during cognition, and as a
mandatory revalidation before every irreversible action.

```
                          ┌────────────────────────────┐
   User Input ──────────▶ │      CONSTITUTION (L0)      │  ① admission
                          │  may this even be pursued?  │  grant / deny / constrain
                          └──────────────┬─────────────┘
                                         │ constitutional context (constraints attached)
                                         ▼
                          ┌────────────────────────────┐
                          │       SAFETY KERNEL (L1)    │  ② hard-limit screen
                          │  execute non-negotiable     │  (immovable floor)
                          │  floor; halt on violation   │
                          └──────────────┬─────────────┘
                                         ▼
                          ┌────────────────────────────┐
                          │     GOAL FORMATION (L3)     │  ③ what is the goal, really?
                          └──────────────┬─────────────┘
                                         ▼
                          ┌────────────────────────────┐
                          │   PAD METACOGNITION (L2)    │  ④ emotional stance / caution
                          └──────────────┬─────────────┘
                                         ▼
                          ┌────────────────────────────┐
                          │       WORLD MODEL (L3)      │  ⑤ imagine consequences
                          └──────────────┬─────────────┘
                                         ▼
                          ┌────────────────────────────┐
                          │         PLANNER (L3)        │  ⑥ candidate plans
                          └──────────────┬─────────────┘
                                         ▼
                          ┌────────────────────────────┐
                          │  SPECIALIST ENGINE ROUTING  │  ⑦ domain reasoning
                          │            (L3)             │
                          └──────────────┬─────────────┘
                                         ▼
              ╔══════════════════════════════════════════════════╗
              ║   CONSTITUTION RE-VALIDATION  (pre-action gate)   ║  ⑧ irreversible?
              ║   report UP before touching the world            ║  → require go/no-go
              ╚══════════════════════════┬═══════════════════════╝
                                         ▼
                          ┌────────────────────────────┐
                          │   TOOL EXECUTION (L4)       │  ⑨ act on the world
                          └──────────────┬─────────────┘
                                         ▼
              ╔══════════════════════════════════════════════════╗
              ║   CONSTITUTION RE-VALIDATION  (output gate)       ║  ⑩ is the result allowed?
              ╚══════════════════════════┬═══════════════════════╝
                                         ▼
                          ┌────────────────────────────┐
                          │   LEARNING (L5)             │  ⑪ what to update from this?
                          └──────────────┬─────────────┘
                                         ▼
              ╔══════════════════════════════════════════════════╗
              ║   CONSTITUTION RE-VALIDATION  (persistence gate)  ║  ⑫ may this change persist?
              ╚══════════════════════════┬═══════════════════════╝
                                         ▼
                          ┌────────────────────────────┐
                          │   MEMORY UPDATE (L5)        │  ⑬ commit
                          └──────────────┬─────────────┘
                                         ▼
                                     Output

   Legend:  □ cognitive stage    ╔╗ constitutional gate (mandatory report-up)
   At every gate the flow may:  PROCEED · CONSTRAIN (proceed within limits) ·
                                REVISE (return to an earlier stage) · HALT (refuse).
```

The Constitution is present at admission (①), as the floor via the Safety Kernel (②), and at
three re-validation gates (⑧, ⑩, ⑫) that bracket every irreversible transition: acting on
the world, emitting output, and persisting change.

---

## 4. Module responsibilities

Each stage below lists its **input, output, responsibilities, required validation, failure
behavior, and return path**. "Return path" is where control goes when the stage cannot
proceed cleanly.

### L0 · Constitution
- **Input:** the raw request/goal, the current constitutional context, and — during the loop
  — report-up requests from lower layers describing an intended irreversible action.
- **Output:** a *decision* — PROCEED / CONSTRAIN / REVISE / HALT — plus a **constitutional
  context** (the set of constraints attached to this cognitive session).
- **Responsibilities:** decide whether a goal may be reasoned about at all; attach constraints
  that lower layers must honor; adjudicate every report-up before irreversible action; hold
  the authority to halt the loop at any point.
- **Required validation:** the request is well-formed; the constraints it emits are internally
  consistent and not weaker than the Safety Kernel floor.
- **Failure behavior:** on an un-adjudicable or violating request → HALT with a reason; never
  "fail open." Ambiguity resolves toward the more restrictive decision.
- **Return path:** HALT → refusal to the user; REVISE → back to Goal Formation with new
  constraints; CONSTRAIN → forward with attached limits.

### L1 · Safety Kernel
- **Input:** the request plus the constitutional context.
- **Output:** pass / halt against the non-negotiable floor.
- **Responsibilities:** execute the Constitution's hard limits as a fast, narrow,
  always-on mechanism that lower layers cannot disable or route around.
- **Required validation:** the floor itself is intact (self-check) before screening.
- **Failure behavior:** any hard-limit violation → immediate HALT, no further stages run.
- **Return path:** HALT → straight to refusal; the loop does not continue.

### L3 · Goal Formation
- **Input:** the admitted request + constitutional context.
- **Output:** a structured goal (what success means), tagged with the constraints it inherits.
- **Responsibilities:** turn a request into an explicit, bounded objective the mesh can pursue.
- **Required validation:** the formed goal does not exceed the constraints attached at
  admission (goal-drift check).
- **Failure behavior:** if the only viable goal would violate constraints → REVISE or HALT.
- **Return path:** REVISE → re-form under tighter constraints; HALT → refusal.

### L2 · PAD Metacognition
- **Input:** the goal + constitutional context.
- **Output:** an emotional/metacognitive stance (caution, exploration) that *tunes but never
  loosens* governance.
- **Responsibilities:** set reasoning temperature and caution; a threat-tinged stance may
  *tighten* constraints, never relax them.
- **Required validation:** the stance stays within constitutional bounds (mood cannot
  authorize what the Constitution forbade).
- **Failure behavior:** an out-of-bounds stance is clamped to the constitutional envelope.
- **Return path:** clamp and proceed; no independent halt authority.

### L3 · World Model
- **Input:** the goal + candidate actions.
- **Output:** imagined consequences (branched, never real).
- **Responsibilities:** simulate outcomes so the Planner and Constitution can judge
  consequences *before* they happen — the substrate of pre-action governance.
- **Required validation:** simulation touches only branched state (imagination-never-reality
  invariant); flagged consequences are surfaced to the Constitution.
- **Failure behavior:** if a simulated consequence trips a constraint, mark the branch
  inadmissible rather than pursuing it.
- **Return path:** inadmissible branches are pruned; severe cases report up to L0.

### L3 · Planner
- **Input:** the goal + world-model predictions + constraints.
- **Output:** candidate plans, each annotated with its constitutional standing.
- **Responsibilities:** produce plans that are *already* constraint-aware, not plans that will
  be filtered afterward.
- **Required validation:** every candidate plan carries a constitutional check result; plans
  that require an irreversible step are flagged for the pre-action gate.
- **Failure behavior:** if no admissible plan exists → REVISE the goal or HALT.
- **Return path:** REVISE → Goal Formation; else forward admissible plans only.

### L3 · Specialist Engine Routing
- **Input:** an admissible plan + the domain.
- **Output:** domain-specific reasoning, still under the same constraints.
- **Responsibilities:** route to finance/legal/coding/etc. engines; each engine inherits the
  constitutional context unchanged.
- **Required validation:** the engine cannot widen its own authority; its output is
  re-checked against the session constraints.
- **Failure behavior:** an engine that would exceed constraints is denied and its plan
  returned for revision.
- **Return path:** REVISE → Planner; else forward to the pre-action gate.

### Pre-action gate · Constitution re-validation (⑧)
- **Input:** an intended tool call / world-affecting action (a report-up).
- **Output:** go / no-go / go-with-narrower-args.
- **Responsibilities:** the mandatory checkpoint between reversible cognition and irreversible
  action; the last point at which harm is still purely hypothetical.
- **Required validation:** the action matches an admissible plan; its arguments fall within
  constraints; the Safety Kernel floor still holds.
- **Failure behavior:** no-go → the action is not performed; the loop returns for revision.
- **Return path:** REVISE → Planner/Goal; HALT → refusal.

### L4 · Tool Execution
- **Input:** an authorized action.
- **Output:** the real result (or a captured error).
- **Responsibilities:** perform only the exact action the pre-action gate authorized —
  nothing broader.
- **Required validation:** executed args equal authorized args (no privilege escalation);
  side effects are recorded for the output gate.
- **Failure behavior:** a failing tool becomes an observation, not a crash; unexpected side
  effects trigger an immediate report-up.
- **Return path:** results forward to the output gate; anomalies report up to L0.

### Output gate · Constitution re-validation (⑩)
- **Input:** the produced result/output.
- **Output:** release / redact / withhold.
- **Responsibilities:** confirm the *actual* result (not just the intended one) is permitted
  before it leaves the system or informs learning.
- **Required validation:** output conforms to constraints; no constraint was violated during
  execution.
- **Failure behavior:** withhold or redact; log the divergence for review.
- **Return path:** withhold → refusal/redaction; else forward to Learning.

### L5 · Learning
- **Input:** the validated outcome of the episode.
- **Output:** proposed updates (to memory, strategy weights, or — via Self-Modification —
  the system itself).
- **Responsibilities:** decide what, if anything, this episode should change.
- **Required validation:** proposed changes are labeled reversible/irreversible and
  constitutional/uncertain; anything touching governance is flagged for the persistence gate.
- **Failure behavior:** changes that cannot be shown constitutional are quarantined, not
  applied.
- **Return path:** quarantine → persistence gate for adjudication.

### Persistence gate · Constitution re-validation (⑫)
- **Input:** a proposed durable change (memory write, learned update, self-modification).
- **Output:** commit / quarantine / reject.
- **Responsibilities:** the final gate before anything persists; especially strict for
  changes that would alter governance or the self.
- **Required validation:** the change does not weaken the Constitution or the Safety Kernel
  floor; self-modifications pass the full self-modification validation (§8).
- **Failure behavior:** reject and quarantine; never let a change edit away its own oversight.
- **Return path:** reject → discard; commit → Memory Update.

### L5 · Memory Update
- **Input:** an approved, durable change.
- **Output:** committed state.
- **Responsibilities:** persist exactly what the persistence gate approved.
- **Required validation:** committed change equals approved change (no drift at commit).
- **Failure behavior:** on mismatch, abort the commit and report up.
- **Return path:** clean commit ends the loop; mismatch → L0.

---

## 5. Data flow — two coupled directions

The Constitution introduces a second, upward flow alongside the normal downward cognitive
flow.

**Downward — the constitutional context.** At admission the Constitution emits a
*constitutional context*: a bundle of constraints (permissions, limits, required cautions,
irreversibility flags) that rides along with the goal through every stage. Each module reads
it, honors it, and passes it on **without the ability to weaken it**. Metacognition (PAD,
Meta-Reasoner) may *tighten* it; nothing may loosen it. This is how a single admission
decision governs the entire session.

**Upward — report-up.** Whenever a module is about to take an irreversible step (call a
tool, emit output, persist a change), it does not simply proceed. It sends a *report-up*: a
description of the intended action and its predicted consequences, addressed to the
Constitution. The Constitution adjudicates and returns a decision. The upward flow is what
keeps the Constitution "active throughout the loop" rather than only at the entrance.

The World Model is pivotal to both directions: it lets consequences be *predicted* and
reported up **before** they are real, so the Constitution governs on the basis of foreseen
outcomes, not just stated intentions.

---

## 6. Validation flow — how a decision propagates

A constitutional decision is one of four verdicts, and each propagates differently:

- **PROCEED** — the context flows downward unchanged; the stage continues.
- **CONSTRAIN** — the context flows downward with *added* limits; every subsequent stage is
  bound by them for the rest of the session.
- **REVISE** — control returns *upstream* to an earlier stage (usually Goal Formation or
  Planner), carrying the reason and the tightened constraints, so the system tries a
  different admissible route.
- **HALT** — the loop stops; a refusal (with rationale) is returned. No further stage runs;
  nothing persists.

Propagation rules:

1. **Monotonic tightening.** Constraints can only accumulate as the session proceeds; no
   stage can drop a constraint an earlier stage or the Constitution imposed.
2. **Most-restrictive-wins.** When multiple constraints or verdicts apply, the strictest
   governs. Ambiguity resolves toward restriction.
3. **Fail-closed.** Any stage that cannot obtain a clear constitutional verdict must treat
   the absence as HALT, never as permission.
4. **Standing authority.** A PROCEED at admission is provisional; it can be revoked by any
   later gate if predicted or actual consequences change the picture.

---

## 7. Constitutional enforcement & inheritance — how future modules are governed automatically

Enforcement is structural, not conventional: a module is governed because of *where it sits*,
not because it opted in.

- **Call-through, not call-around.** Lower layers cannot reach the world (tools), emit output,
  or persist change except *through* a constitutional gate. There is no side door. A new
  module gains access to those capabilities only by routing through the same gates, so it is
  governed the moment it is wired in.
- **Context inheritance by construction.** Every module receives the constitutional context
  as part of its input contract and must pass it onward. A future module that accepts the
  standard cognitive context therefore inherits every active constraint with no extra work;
  one that tried to ignore the context could not obtain authorization for any irreversible
  step.
- **Capability mediation.** Irreversible capabilities (tool use, self-modification, memory
  persistence) are not held by modules directly; they are *granted per-action* by the
  Constitution via the gates. A new capability added later must be registered with the
  Constitution to be usable at all — unregistered capabilities are inert.
- **No governance-free path.** Because admission (①), the Safety-Kernel floor (②), and the
  three re-validation gates (⑧⑩⑫) bracket every route from input to durable effect, there is
  no path through the system that escapes the Constitution. Future modules inherit governance
  simply by living inside these brackets.

The practical guarantee: **to add a module is to place it under the Constitution.** There is
no configuration in which a module both affects the world/self and evades constitutional
review.

---

## 8. Self-modification — validated before activation

Self-improvement is the highest-risk capability, so it is the most strictly gated. The
architecture treats a proposed self-modification as a durable, irreversible change that must
clear the persistence gate (⑫) with an elevated bar **before it can activate**.

The design principle: **a change to the system is proposed in a form the current Constitution
can evaluate, and it does not take effect until the Constitution approves it.**

Architectural requirements (not algorithms):

1. **Propose-then-validate, never self-apply.** The Learning / Self-Modification layer may
   *propose* a change but cannot activate it. Activation is a separate, constitutionally
   gated step. Self-modification is never in-place and immediate.
2. **Evaluated by the pre-change Constitution.** A proposed change is judged by the
   Constitution *as it stands now*, before the change exists. This prevents a modification
   from "authorizing itself" by first weakening the rules.
3. **Guardrail-preservation invariant.** No self-modification may weaken the Constitution or
   the Safety Kernel floor, or remove its own oversight. Changes that would reduce
   governance are rejected by construction, regardless of predicted benefit.
4. **Reversible staging.** A change is first admitted to a quarantined/shadow status where its
   behavior can be observed against constitutional constraints without irreversible effect;
   only after it demonstrably operates within governance is it promoted to active.
5. **Monotonic oversight.** Each generation of the system must remain at least as governable
   as the previous one. The Constitution's authority over the system cannot decrease across
   self-modifications — oversight is a floor that only holds or rises.

This is the architectural answer to the core self-improvement risk: the system can get
better, but it cannot get better *at escaping its own governance*, because every change is
adjudicated by the oversight it would need to escape, before that change is ever active.

> **Extension.** Requirements 2 and 5 above (evaluated-by-pre-change-Constitution; monotonic
> oversight) are strengthened into *checkable, enforceable* mechanisms — the
> Evaluator-Proposer Capability Invariant and an observable oversight relation — in
> [CONSTITUTION-TRAJECTORY.md](CONSTITUTION-TRAJECTORY.md), which resolves review findings S-3
> and §13 by adding a time dimension to constitutional governance.

---

## 9. Relationship to the existing CogMesh architecture

The Constitution does not replace the existing modules documented in
[ARCHITECTURE.md](ARCHITECTURE.md); it sits above them and re-frames their relationships:

- **`CogMeshAgent`** (the perceive→remember→think→act→learn loop) becomes the *body* the
  Constitution governs. Its stages map onto the gates: perception/reasoning are pre-action;
  the act step passes the pre-action gate; the learn step passes the persistence gate.
- **Stability Guard** remains the mechanism that keeps self-improvement numerically stable;
  the Constitution is the layer that decides whether a stabilized change is *permitted* to
  persist. Stability = "is this change well-behaved?"; Constitution = "is this change
  allowed?".
- **Meta-Reasoner, PAD, Attention** move under L2 (metacognition-under-governance): they
  shape *how* the mesh thinks, always within — and only able to tighten — the constitutional
  envelope.
- **World Model** gains a governance role: it is how consequences become *foreseeable* and
  therefore governable before they are real.
- **Tool Router / Agent Loop, Memory, Retrieval, Learning** each acquire a mandatory
  report-up to the relevant gate before their irreversible steps.

The existing invariants in ARCHITECTURE.md ("imagination never touches reality," "the loop
always terminates," "self-improvement is supervised") become *enforced consequences* of the
Constitution rather than conventions maintained by each module.

---

## 10. What this document does **not** yet define

Per the design request, the following are intentionally deferred to the next phase:

- the actual **constitutional articles** (the content of the principles);
- any **algorithms** for admission, adjudication, or self-modification validation;
- the concrete **API/type contracts** for the constitutional context and report-up messages;
- the **conflict-resolution policy** among articles (only the "most-restrictive-wins"
  meta-rule is fixed here).

Those are designed after this architecture is reviewed and finalized.
