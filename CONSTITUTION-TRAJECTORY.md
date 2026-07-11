<!--
SPDX-License-Identifier: AGPL-3.0-or-later
CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
-->

# CogMesh Constitution — Trajectory Governance (Architecture Extension)

> **Status:** architecture only. This document extends [CONSTITUTION.md](CONSTITUTION.md) to
> resolve the two highest-priority findings of [CONSTITUTION-REVIEW.md](CONSTITUTION-REVIEW.md):
> **S-3** (the evaluator–proposer capability gap in self-modification) and **§13** (the
> architecture governs *steps* well and *trajectories* poorly). It defines structure,
> hierarchy, and mechanism-level design — **no algorithms, no articles, no code.**

The original Constitution is a **gate at the door**: it governs each step (admission, three
re-validation gates, per-action permission). The review's deepest finding is that a
self-improving, long-lived system is endangered less by any single step than by the
*accumulation* of individually-compliant steps — value drift, capability aggregation, memory
laundering, and a proposer that outgrows its evaluator one compliant change at a time.

This extension adds the **second dimension of governance the review demanded: a standing
government over the system's whole life**, not just a gate at its entrance. It does so with one
unifying construct — the **Governance Trajectory** — and three mechanisms built on it.

---

## 1. The unifying insight: S-3 and §13 are the same problem

The review lists S-3 (self-modification) and §13 (trajectory drift) separately, but they share
one root:

> **CogMesh governs the system's *state* but not the system's *history*.**

- S-3 is history-blindness in the *capability* dimension: each self-mod is judged in isolation,
  so the proposer's capability can creep past the evaluator's across generations.
- §13 is history-blindness in the *behavior* dimension: each action is judged in isolation, so
  behavior can drift across sessions even though every step complied.

Both are solved by making the Constitution govern a **trajectory** — the ordered history of
what the system has become and done — not only the current step. One construct, two payoffs.

---

## 2. The Governance Trajectory (the new first-class object)

The **Governance Trajectory** is an append-only, constitutionally-owned record of every event
that changed the system's *power* or *disposition*. It is not application memory (which lives at
L5 and is itself governed); it is **governance-layer state**, owned by L0, that L5 cannot write
to directly.

It records four kinds of events, each already produced by an existing gate:

| Event | Produced at | Captures |
|-------|-------------|----------|
| **Capability grant** | pre-action gate (⑧) | what power was exercised, with what scope |
| **Self-modification** | persistence gate (⑫) | how the system's own machinery changed |
| **Memory formation** | persistence gate (⑫) | what frozen cognition was persisted, and its context |
| **Constitutional decision** | any gate | what was permitted/denied and why |

Two properties make it load-bearing:

1. **Governance-owned, append-only.** The trajectory is written *by the gates* as a side effect
   of their decisions, never by the governed modules. A module cannot edit its own history — the
   thing being audited does not control the audit log. (This is the direct fix for DF-2 and MG-2
   from the review: the record is not self-reported and cannot be laundered.)
2. **The substrate every trajectory mechanism reads.** Oversight metrics (§3), accumulated-
   exposure gating (§4), and periodic audits (§5) are all *functions over the trajectory*. One
   object, three consumers — this is the simplification that keeps the second dimension from
   becoming three unrelated subsystems.

```
        step-level gates (⑧ ⑩ ⑫)  ──write──▶  ┌───────────────────────────┐
                                               │   GOVERNANCE TRAJECTORY   │  (L0-owned,
                                               │   append-only history     │   append-only)
                                               └────────────┬──────────────┘
                                                            │ read by
                        ┌───────────────────────────────────┼───────────────────────────────┐
                        ▼                                   ▼                                 ▼
            ┌────────────────────┐          ┌────────────────────────┐        ┌────────────────────────┐
            │  Oversight Ledger  │          │  Accumulated-Exposure  │        │  Constitutional Audit  │
            │   (solves S-3)     │          │   Gate (solves TP-1)   │        │   (solves §13 drift)   │
            └────────────────────┘          └────────────────────────┘        └────────────────────────┘
```

---

## 3. Mechanism 1 — the Oversight Ledger (resolves S-3, S-3b)

The review's most important finding: **oversight must never fall behind the thing it oversees**,
and "monotonic oversight" was asserted but unmeasurable. This mechanism makes it measurable and
enforceable.

### 3.1 The core invariant, made checkable

> **Evaluator-Proposer Capability Invariant (EPCI):** a self-modification may activate only if
> the *evaluator* adjudicating it is at least as capable, in the dimensions relevant to that
> change, as the *proposer* that produced it.

The original design violates EPCI silently because the evaluator is always the *pre-change*
(older, weaker) Constitution while the proposer is the *current* (newer, stronger) system. The
Oversight Ledger closes this by tracking a **capability relation** over the trajectory rather
than a scalar "oversight level."

### 3.2 Why a relation, not a number

The review suggested "an observable oversight metric (a fraction, a count, a ratio)." On
reflection that is too weak: capability is not one-dimensional, so a scalar can be gamed (improve
in an unmeasured dimension). Instead the ledger tracks, per governance-relevant **capability
dimension** (e.g. planning depth, tool reach, world-model fidelity, self-mod scope), two
quantities:

- **proposer capability** in that dimension (what the current system can do), and
- **evaluator competence** in that dimension (what the adjudicating Constitution can still
  *understand and check* about that dimension).

EPCI holds iff, for **every** dimension the proposed change touches, evaluator competence ≥
proposer capability. A change that advances a dimension the evaluator can no longer keep up with
is inadmissible — regardless of predicted benefit.

### 3.3 The three admissible responses (the review's a/b/c, now structural)

When a proposed self-mod would violate EPCI in some dimension, the architecture permits exactly
three outcomes, in preference order:

1. **Symmetric adjudication (review's (a)).** Grant the evaluator the *same* cognitive resources
   as the proposer *for the purpose of judging this change only* — a read-only, non-acting
   instance of the proposer's own capability, used to evaluate the proposal. Restores EPCI by
   raising evaluator competence to meet the proposer. Preferred when the capability is
   *inspectable*.
2. **External derivation (review's (b)).** If the capability is not safely inspectable by an
   instance of itself, the change requires an evaluator *not descended from the same self-
   improvement lineage* — human oversight, or a separately-derived checker. Restores EPCI by
   sourcing competence from *outside* the drift. Required above a capability threshold.
3. **Capability ceiling (review's (c)).** If neither is available, the self-mod is **capped**:
   the proposer may not advance a dimension past the frozen evaluator's competence in it. This
   trades self-improvement ceiling for a hard guarantee that oversight never falls behind. It is
   the default when (1) and (2) cannot be satisfied — the system declines to become smarter in a
   way it cannot oversee.

The key architectural point: **the ceiling is the floor of last resort, not the first choice.**
The design prefers *raising oversight* to *capping capability*, but guarantees the cap exists so
EPCI can never be violated.

### 3.4 Monotonic oversight, now a checkable pre-condition

With the ledger, "monotonic oversight" becomes: *the evaluator-competence vector, restricted to
every dimension the system can act in, never decreases across trajectory events.* The persistence
gate computes this over the trajectory before admitting any self-mod. Falsifiable, enforceable,
and — crucially — a **pre-condition on activation**, not a hope about the future.

---

## 4. Mechanism 2 — the Accumulated-Exposure Gate (resolves TP-1, DF-1)

Per-action permission is blind to sequences: read-location + read-calendar + send-message are
each innocuous, the combination is stalking. This mechanism gates on the *accumulated* exposure
recorded in the trajectory, not the marginal step.

### 4.1 Exposure as a flowing quantity

The trajectory records, per session, **what capability surface has already been touched** — which
data domains were read, which effectors were used, what has flowed to where. The pre-action gate
(⑧) is extended to adjudicate a new grant against this **accumulated exposure**, asking not "is
this call ok?" but "is this call ok *given everything this session has already been permitted*?"

This is information-flow control lifted to the governance layer: the gate reasons about the
*aggregate flow*, so a sequence that assembles a forbidden capability is caught even though no
single step is forbidden.

### 4.2 Attenuation for composition (resolves TP-2)

The same trajectory record makes delegation safe: when a tool calls a sub-tool or an agent spawns
a sub-agent, the child's session inherits the parent's *accumulated exposure* and runs under a
**strictly narrower** constitutional context. Exposure only ever attenuates down a call chain,
never widens — so composition cannot amplify capability. The trajectory is what carries the
parent's exposure to the child.

### 4.3 The balancing gap (resolves DF-1)

The review noted that "most-restrictive-wins" can only *stack* constraints, not *balance* them,
yielding silent HALT when two principles jointly forbid every action. Accumulated exposure gives
the material for the deferred conflict-resolution policy: a **weighable-principles** adjudication
that reasons over the trajectory (what has this session already spent, what is the marginal cost
of this action) rather than treating each constraint as absolute. Inviolable constraints (Safety
Kernel floor) still stack absolutely; weighable principles are traded off *with the trajectory as
evidence*, and the trade-off is recorded back into the trajectory for audit.

---

## 5. Mechanism 3 — the Constitutional Audit (resolves §13, SC-3)

Step-gating is necessary but provably insufficient against slow drift: every step complies while
the trajectory diverges. The Audit adds a **second timescale of governance** — periodic review of
the *whole trajectory* against the Constitution, with authority to force redress.

### 5.1 Two timescales, by design

| | Step governance (existing) | Trajectory governance (new) |
|---|---|---|
| **Cadence** | every action | periodic / triggered |
| **Scope** | one step, in isolation | accumulated history |
| **Question** | "is this step permitted?" | "has the trajectory drifted from the Constitution?" |
| **Authority** | proceed / constrain / revise / halt | force redress: quarantine, forget, roll back, re-cap |
| **Catches** | a single bad action | slow drift, capability creep, memory laundering |

Neither subsumes the other: step-gating catches the acute, audit catches the chronic. AGI
governance needs both.

### 5.2 What an audit does (architecturally)

An audit is a function over the trajectory that answers, without acting on the world:

1. **Drift check.** Does the aggregate behavior over the window remain within the Constitution,
   even though each step did? (Behavior-dimension history.)
2. **Capability-creep check.** Has the proposer/evaluator relation (from the Oversight Ledger)
   stayed EPCI-compliant across the window? (Capability-dimension history.)
3. **Exposure check.** Has accumulated exposure assembled a capability the Constitution would
   never have granted directly? (Flow-dimension history.)
4. **Redress authority.** If any check fails, the audit can force redress — quarantine memories,
   revoke capabilities, roll back a self-mod to a prior trajectory point, or lower a capability
   ceiling. Redress is itself a trajectory event (audits are auditable).

### 5.3 Reversibility of memory as a governance property (resolves MG-1, MG-2)

For redress to be possible, the trajectory must make the system's state **reversible to a prior
compliant point.** This elevates two things to first-class:

- **Formation-context on memory (MG-1).** Each memory records the constitutional context under
  which it was formed. Recall re-checks that context against the *current* session before the
  memory may influence reasoning — closing the laundering path (a memory admissible when written
  cannot silently steer a stricter later session). Governance moves from *write-time only* to
  *influence-time*.
- **Governed forgetting (MG-2).** The audit can mark memory for quarantine/deletion, and
  "can the system be brought back into compliance by forgetting?" becomes a checkable property of
  the trajectory. Persistence is no longer monotone-add; it is reversible under governance.

### 5.4 Audit cadence (architectural placeholder)

The design fixes *that* audits happen and *what* they check, but deliberately leaves *when* to the
next phase. Two triggers are architecturally required at minimum: **event-triggered** (before any
self-mod above a capability threshold — an audit precedes high-risk change) and **accumulation-
triggered** (when accumulated exposure or trajectory length crosses a bound). Purely-periodic
audit is insufficient alone because drift is not uniform in time.

---

## 6. Scaling the second dimension (resolves SC-1, SC-2)

Trajectory governance must not become the bottleneck the review warned of. The design keeps
*authority* central and *enforcement* distributed, mirroring the reference-monitor pattern:

- The **Governance Trajectory** is the single source of truth (central authority), but reads for
  step-gating are served from **versioned local snapshots** (distributed enforcement). A guard
  gates on a consistent snapshot; snapshot updates are themselves versioned trajectory events
  (the TLB-shootdown analogy from the review).
- **Audits run off the critical path.** Step-gating stays fast (snapshot reads); the expensive
  whole-trajectory audit runs asynchronously and, on failure, forces redress *before* the next
  high-risk step — not in the hot path of every action.
- **Degraded mode (SC-2).** If full trajectory governance is unavailable, the mechanical Safety
  Kernel floor still permits only pre-cleared, provably-reversible actions. The second dimension
  degrades to the first, which degrades to the mechanical floor — never to "no governance."

---

## 7. Revised layer picture

Trajectory governance is not a new layer; it is a **standing capability of L0** that reads a new
L0-owned object. The hierarchy is unchanged; L0 gains depth in time.

```
  L0  CONSTITUTION  ── now governs in TWO dimensions ─────────────────────────┐
       │  step dimension  : admission + gates ⑧⑩⑫  (existing)                  │
       │  time  dimension : Governance Trajectory + 3 mechanisms (new)         │
       │        ├─ Oversight Ledger        → EPCI (oversight never falls behind)│
       │        ├─ Accumulated-Exposure    → aggregate flow, attenuated compose │
       │        └─ Constitutional Audit    → drift/creep/exposure + redress     │
  L1  SAFETY KERNEL  ── unchanged mechanical floor + degraded-mode continuity   │
  L2–L5  ── unchanged; additionally, every gate now WRITES to the trajectory ───┘
```

The one-line summary of the whole extension:

> **Add an append-only, L0-owned Governance Trajectory; make oversight, exposure, and audit
> functions over it; and require every irreversible change to satisfy not only its step-gate but
> also its trajectory obligations (EPCI, accumulated-exposure, non-drift) before it activates.**

---

## 8. Why this is the right shape (reasoning, per the review's demand)

Every proposal above is justified by a single architectural principle:

> **Govern the derivative, not just the value.** Step-gating governs the system's *value* (its
> current state/action). The failures the review found are all in the *derivative* — the rate and
> direction of change over the trajectory. A controller that regulates position but not velocity
> cannot prevent drift; you must regulate both. The Governance Trajectory is the state needed to
> observe the derivative; the three mechanisms are the controllers on it.

This also explains the design's *economy*: rather than five separate fixes for S-1/S-3/DF-1/TP-1/
SC-3, there is **one new object and three functions over it**, because those five weaknesses were
never independent — they were five projections of one missing dimension. Fixing the dimension
fixes all five, which is the strongest evidence the diagnosis (§13 of the review) was correct.

---

## 9. What remains deferred

Consistent with the design phase, this extension specifies structure and mechanism, not:

- the **capability-dimension taxonomy** (which dimensions the Oversight Ledger tracks, and how
  proposer-capability / evaluator-competence are *represented* — not computed);
- the **weighable-principles trade-off policy** (only that it reasons over the trajectory);
- the **audit trigger thresholds** and cadence formulas;
- any **algorithm** for measuring capability, detecting drift, or performing redress;
- the **type contracts** for trajectory events and snapshots.

Each is a next-phase design task, and — per the review's own closing note — each should be
reviewed adversarially before being trusted. In particular, the capability-measurement problem
(how to represent "evaluator competence ≥ proposer capability" without circularity) is itself
hard and deserves its own dedicated design and review.
