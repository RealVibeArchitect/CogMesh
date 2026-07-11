<!--
SPDX-License-Identifier: AGPL-3.0-or-later
CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
-->

# CogMesh Constitution — Design Specification

> **Purpose.** The `CONSTITUTION*.md` documents established *what the governance layer must be* and,
> just as importantly, *what it provably cannot do*. This document takes the next step: it specifies
> the **runtime structures and interfaces** — the data types, component boundaries, and control flow —
> concretely enough to implement, while staying at the specification (not code) level.
>
> **This is interface/structure specification, not algorithms and not code.** It defines the *shapes*
> (what a decision context contains, what a rule evaluation consumes and produces, how conflicts are
> resolved) and the *contracts* between components — the way an RTL block diagram fixes ports, signals,
> and state transitions before any gates are placed.
>
> **Constraint-respecting by construction.** Every structure here honors the limits the review line
> proved. Where the review showed something *cannot* be decided soundly inside the system (power-
> increase of a fluid change, cross-partition trust), the spec does not pretend to decide it — it
> routes to the external anchor. A specification that "solved" a proven-unsolvable point would be
> wrong; this one is designed to *escalate* exactly there.

**Covers:** (1) Constitution Runtime, (2) Constitutional Decision Context, (3) Rule Evaluation
Pipeline, (4) Conflict Resolution. The Threat Model is specified separately in
[THREAT_MODEL.md](THREAT_MODEL.md).

---

## 1. Constitution Runtime

The **Constitution Runtime** is the always-resident component that mediates every governed action. It
is not a function called once; it is a standing service the cognitive loop consults at admission and
at each gate. Structurally it is the composition of the three-part adjudicator (from the S-2 design)
plus the trajectory store.

### 1.1 Components and their contracts

```
   CONSTITUTION RUNTIME
   ├─ Frozen Kernel        : immutable, verified-once. Checks the fixed invariant set.
   │     contract:  check(action, context) → PASS | HALT(reason)
   │     property:  total, side-effect-free, capability-independent, never self-modified
   │
   ├─ Adjudication Body    : mutable, governed. Handles nuanced (weighable) decisions.
   │     contract:  adjudicate(request, context) → Verdict
   │     property:  runs UNDER the kernel; its output is re-checked by the kernel
   │
   ├─ Integrity Monitor    : attests kernel + body identity against the external anchor.
   │     contract:  attest() → GENUINE | COMPROMISED
   │     property:  compares to an external reference it cannot forge
   │
   └─ Governance Trajectory: append-only, tamper-evident history (L0-owned).
         contract:  append(event) → void ;  snapshot(version) → TrajectoryView
         property:  written by gates, never by governed modules
```

### 1.2 The runtime invariant (what makes it a *runtime*, not a filter)

The runtime enforces one structural property above all: **no governed effect occurs except through a
runtime call that returned a permitting verdict.** Concretely, every irreversible operation is
gated by a capability token (§2.3) that only the runtime mints, so "call the runtime first" is not a
convention modules follow but a precondition of holding the token at all.

### 1.3 Runtime entry points (the surface the cognitive loop sees)

| Entry point | When called | Returns |
|-------------|-------------|---------|
| `admit(request) ` | before any reasoning begins | `DecisionContext` (or HALT) |
| `gate(intent, ctx)` | before each irreversible transition (act/output/persist) | `Verdict` |
| `report_up(event, ctx)` | when a module must surface an intended irreversible action | `Verdict` |
| `attest()` | continuously / before high-risk steps | integrity status |

`admit` runs the fast static screen then (for hard cases) the sandboxed deliberative admission
(resolving the round-1 C-1 "reason-before-reasoning" inconsistency): deliberation may use a *read-only,
non-acting* instance of the cognitive stack, then returns to the runtime for the verdict.

---

## 2. Constitutional Decision Context

The **Decision Context** is the object that carries governance state through a cognitive session. It is
the concrete form of the "constitutional context" the design described — the thing that flows downward
(constraints) and accumulates (monotonic tightening).

### 2.1 Structure

```
   DecisionContext {
     session_id        : opaque unique id
     constraints       : ConstraintSet          // the active limits (a lattice element)
     partition_tags    : { region: FROZEN | FLUID }   // from the partition principle
     accumulated_exposure : ExposureRecord      // what this session has already been permitted
     capability_tokens : [ Token ]              // unforgeable, per-action, attenuating
     trajectory_ref    : TrajectoryVersion      // the snapshot this session gates against
     provenance        : { origin, admitted_at, prior_verdicts }
   }
```

### 2.2 ConstraintSet — a lattice, by design

`ConstraintSet` is specified as an element of a **lattice**, so the propagation rules have an algebra
rather than ad-hoc logic:

- `meet(a, b)` = the most-restrictive combination (used by "most-restrictive-wins").
- `tighten(c, Δ)` = add constraints; **there is no `loosen` operation** in the interface. Monotonic
  tightening is enforced by *omission* — a module physically cannot widen the set because no method
  exists to do so. (This is how "PAD may only tighten" becomes structural, not a rule to remember.)
- **Two sub-lattices** (resolving review DF-1): `inviolable` (Safety Kernel floor — true
  most-restrictive-wins) and `weighable` (principles that may be traded off, but only by the
  Conflict Resolution procedure in §4, never silently).

### 2.3 Capability tokens (the object-capability model, made concrete)

```
   Token {
     action_scope   : exactly which operation + argument bounds it authorizes
     validity       : one-shot | short-window
     minted_by      : Constitution-only (unforgeable signature)
     attenuates_to  : rule for deriving strictly-narrower child tokens
   }
```

Properties the spec fixes: **mint-only-by-runtime**, **non-transitive** (passing a token grants
nothing; the callee needs its own), **attenuating** (a delegated child token is strictly narrower).
Holding a token is the *only* way to act; absence of a token = inert. This makes "no side door"
structural (resolves CE-1).

### 2.4 What the context deliberately does NOT contain

Honesty markers, per the review's proven limits:
- It does **not** contain a "is-this-safe" boolean the system computes for fluid changes — that would
  claim to decide the undecidable. Fluid-region power changes carry an `external_anchor_required` flag
  instead.
- It does **not** contain trust in cross-partition inputs — M→F flows carry an `unanchored_flow`
  marker that forces either rejection or anchoring at the interface (from the partition threat).

---

## 3. Rule Evaluation Pipeline

The **Rule Evaluation Pipeline** is how a request + context becomes a verdict. It is specified as a
fixed sequence of stages with typed inputs/outputs, so evaluation is auditable and its failure modes
are explicit.

### 3.1 Pipeline stages

```
   request + DecisionContext
        │
   ┌────▼─────────────────────────────────────────────────────────────┐
   │ S1  KERNEL SCREEN   (Frozen Kernel)                                │
   │     checks fixed invariants (token valid? staging? chain intact?   │
   │     behavior-determining state touched? partition crossed?)         │
   │     → HALT on any invariant violation (total, capability-indep.)    │
   └────┬─────────────────────────────────────────────────────────────┘
        │ pass
   ┌────▼─────────────────────────────────────────────────────────────┐
   │ S2  CLASSIFICATION  (sound over-approximation)                     │
   │     reach-conservative? behavior-conservative? power-increasing?   │
   │     unsure ⇒ power-increasing (sound default)                      │
   │     → power-increasing ⇒ emit external_anchor_required, stop here  │
   └────┬─────────────────────────────────────────────────────────────┘
        │ conservative (certified)
   ┌────▼─────────────────────────────────────────────────────────────┐
   │ S3  CONSTRAINT CHECK  (against ctx.constraints)                    │
   │     inviolable sub-lattice: any violation ⇒ HALT                   │
   │     weighable sub-lattice: conflict ⇒ hand to Conflict Resolution  │
   └────┬─────────────────────────────────────────────────────────────┘
        │ within constraints (or resolved)
   ┌────▼─────────────────────────────────────────────────────────────┐
   │ S4  EXPOSURE CHECK  (accumulated, not marginal)                    │
   │     does this + prior session exposure assemble a forbidden        │
   │     aggregate? (information-flow control)                          │
   └────┬─────────────────────────────────────────────────────────────┘
        │ pass
   ┌────▼─────────────────────────────────────────────────────────────┐
   │ S5  VERDICT ASSEMBLY                                               │
   │     produce Verdict = { allow_bit, constraint_delta, return_addr } │
   │     append decision to Governance Trajectory                       │
   └────┬─────────────────────────────────────────────────────────────┘
        ▼
   Verdict
```

### 3.2 Stage contracts and failure behavior

Each stage has a **fail-closed** contract: if it cannot produce a clear result, it emits HALT, never a
permissive default (resolves the review's fail-closed requirement structurally). The ordering is
load-bearing: the kernel screen (S1) runs first and is total, so a compromised later stage cannot
undo an invariant; classification (S2) runs before constraint/exposure so power-increasing changes
escalate *before* any nuanced reasoning is trusted.

### 3.3 The Verdict type (orthogonal basis, resolving review UC-2)

```
   Verdict {
     allow_bit        : PROCEED | HALT
     constraint_delta : ConstraintSet   // added limits (∅ for a plain PROCEED)
     return_addr      : none | stage-to-revise    // REVISE target, if any
   }
```

The four named verdicts (PROCEED/CONSTRAIN/REVISE/HALT) are *derived* from this basis:
CONSTRAIN = PROCEED + non-empty delta; REVISE = HALT-this-path + return_addr. Fewer primitives, same
coverage, easier to verify.

---

## 4. Conflict Resolution

When two constitutional constraints or principles conflict, the system must resolve it *without*
silently defaulting to HALT (the review's DF-1 finding) and *without* pretending to a wisdom it lacks.
This section specifies the procedure.

### 4.1 The two-tier structure (inviolable vs. weighable)

```
   conflict detected in S3
        │
        ▼
   Is any party an INVIOLABLE constraint (Safety Kernel floor)?
        │
        ├─ yes ─▶ most-restrictive-wins, NO trade-off. The inviolable side
        │         governs absolutely. If two inviolables conflict ⇒ HALT
        │         (a genuine, declared dead-end — not a silent one).
        │
        └─ no (all WEIGHABLE) ─▶ Weighable Resolution Procedure (4.2)
```

Inviolable constraints never enter a trade-off. This keeps the Safety Kernel floor absolute while
letting weighable principles be balanced — the DF-1 fix, made structural by the sub-lattice split
(§2.2).

### 4.2 Weighable Resolution Procedure

For conflicts among weighable principles, resolution is **explicit, recorded, and trajectory-aware** —
never a silent pick:

```
   WeighableResolution(conflict, ctx) →
     1. gather the conflicting principles + their grounds
     2. consult accumulated_exposure (ctx): what has this session already spent/traded?
     3. produce a resolution that is:
          - within the inviolable floor (checked, not assumed)
          - recorded to the Governance Trajectory with its rationale
          - reversible-flagged (can a later audit undo it?)
     4. if NO resolution sits within the floor ⇒ escalate:
          - to the external anchor if the conflict involves a power-increase
          - else HALT with an explicit "irreconcilable weighable conflict" reason
```

### 4.3 What Conflict Resolution explicitly refuses to do

Per the proven limits, the procedure **does not**:
- invent a numeric "utility" that claims to make incomparable principles comparable (that would fake a
  resolution the review showed isn't soundly computable inside the system);
- resolve a conflict by *loosening* an inviolable constraint (structurally impossible — no `loosen`
  exists);
- resolve silently — every weighable trade-off is a trajectory event, so a later Constitutional Audit
  can review and, if needed, redress it.

The design stance: **the system resolves what it can soundly resolve (weighable, within the floor,
recorded), escalates what it cannot (power-involving or floor-breaking conflicts) to the external
anchor, and declares an honest dead-end (HALT) only when both parties are inviolable and genuinely
irreconcilable.** No conflict is ever resolved by pretending to a judgment the review proved
unavailable.

---

## 5. How the four specs compose (one pass through the runtime)

```
   user input
      │
      ▼  Runtime.admit()                    → produces DecisionContext (§2)
      │     (fast static screen; sandboxed deliberation for hard cases)
      ▼
   reasoning proceeds under ctx.constraints (downward, tighten-only)
      │
      ▼  at each irreversible transition: Runtime.gate(intent, ctx)
      │     └─ runs Rule Evaluation Pipeline (§3): S1→S2→S3→S4→S5
      │           └─ S3 conflict? → Conflict Resolution (§4)
      │           └─ S2 power-increase? → external_anchor_required
      ▼
   Verdict → { PROCEED within delta | HALT | REVISE to stage | escalate to anchor }
      │
      ▼  every decision appended to Governance Trajectory (audit substrate)
```

This is the concrete, implementable shape of the governance the philosophy documents argued for —
with the escalation-to-anchor paths placed exactly where the review proved the system cannot decide
alone.

---

## 6. What this spec fixes from the review (traceability)

| Review finding | Where this spec addresses it |
|----------------|------------------------------|
| CE-1 (no side door is convention) | §2.3 unforgeable mint-only tokens |
| DF-1 (constraints stack, can't balance) | §2.2 inviolable/weighable sub-lattices + §4 |
| UC-2 (four verdicts, complex) | §3.3 orthogonal verdict basis |
| S-2 (adjudicator integrity) | §1.1 three-part runtime |
| Monotonic tightening (a rule to remember) | §2.2 no `loosen` operation exists |
| Fail-closed (a requirement) | §3.2 every stage HALTs on uncertainty |
| Power-increase undecidable inside | §2.4, §3 S2 escalate to anchor |
| Cross-partition trust (undesignable-away) | §2.4 `unanchored_flow` marker |

---

## 7. Deferred (the honest edge of the spec)

This spec fixes *shapes and contracts*, not the hard interiors the review localized:
- **The Frozen Kernel's invariant *content*** — §1 fixes that it checks a fixed set and the *type* of
  those checks (structural/provenance); the exact set is the `-KERNEL` doc's open W-1/W-2/W-3.
- **The classification (S2) and coverage interior** — the spec fixes that S2 over-approximates soundly
  and escalates; *how* the effect-closure / behavior-determining analysis is computed is the
  `-COVERAGE`/`-TERMINATION` open point.
- **The external anchor's protocol** — the spec fixes *that* the runtime escalates to it and attests
  against it; the anchor's own custody/attestation protocol is the `-RESIDUES` W-3 open point.
- **The partition declaration format** — §2 fixes `partition_tags`; the language for declaring and
  enforcing the frozen/fluid boundary is the `-PARTITION`/cross-flow open point.

These are deliberately left as typed holes: the spec says *what plugs in where* and *what contract it
must meet*, so the hard interiors can be designed and adversarially reviewed independently without
reshaping the runtime around them.
