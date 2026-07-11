<!--
SPDX-License-Identifier: AGPL-3.0-or-later
CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
-->

# CogMesh Constitution — Review Round 2

> **Two tasks in one document.**
> **Part A** — an adversarial re-review of the trajectory-governance extension
> ([CONSTITUTION-TRAJECTORY.md](CONSTITUTION-TRAJECTORY.md)), with special focus on the
> capability-measurement circularity that the extension itself flagged as unresolved.
> **Part B** — improved architecture for two deferred first-round findings:
> **S-2** (adjudicator integrity) and **CE-1** (object-capability enforcement).
>
> Architecture only — no algorithms, no articles, no code.
>
> **Bias disclosure (stronger this round).** The trajectory extension reviewed in Part A was
> authored one step earlier in the same line of work, and it contains self-praise ("elegant,"
> "the design's economy," "the strongest evidence the diagnosis was correct"). Self-praise is a
> red flag, so Part A deliberately targets exactly those claims. A proposal that calls itself
> economical and correct has not been reviewed; it has been marketed.

---

# Part A — Adversarial re-review of trajectory governance

## A0. Summary judgment

The trajectory extension is a real improvement in *framing*: "govern the derivative, not the
value" correctly names the missing dimension, and routing five findings through one object is
genuinely tidier. But the extension **buys its elegance with an IOU it cannot cash.** Its central
mechanism, the Oversight Ledger, depends on measuring "evaluator competence ≥ proposer
capability" — and the extension defers that measurement to "a next-phase task" while *already
relying on it* for its main safety guarantee. That is not a deferral; it is a load-bearing hole
with a promissory note over it.

Four findings, in priority order:

- **T-1 (critical): the capability-measurement circularity is not merely deferred — it is
  self-referential in a way that may be unresolvable as posed.**
- **T-2 (critical): symmetric adjudication (response (a)) reintroduces the very risk it claims to
  remove.**
- **T-3 (major): the "one object, three functions" economy hides a coupling that makes the
  trajectory a single point of total compromise.**
- **T-4 (major): asynchronous audit + "redress before the next high-risk step" contains a
  race the design does not close.**

## A1. T-1 — the circularity is structural, not schedular

The extension says (its §9): *"how to represent 'evaluator competence ≥ proposer capability'
without circularity is itself hard and deserves its own design."* This undersells the problem.
It is not that the measurement is *hard*; it is that, **as posed, the measurement may be
impossible in principle**, and the architecture rests on it.

The circularity has three nested layers:

1. **Measurement requires the capability being measured.** To judge whether the evaluator can
   "understand and check" a proposer that reasons at depth *N*, the judge must itself reason
   about depth-*N* reasoning — i.e. possess depth-*N* capability. So measuring the gap requires
   already having closed it. The metric presupposes its own conclusion.

2. **Self-assessment of competence is the least trustworthy assessment.** A system asked "can you
   fully understand this more-capable proposal?" is exactly the system least equipped to answer
   correctly if the answer is "no" — a competence deficit includes the deficit of recognizing
   it. (This is the Dunning-Kruger structure, but load-bearing for safety.)

3. **The dimensions themselves drift.** The ledger tracks "governance-relevant capability
   dimensions." But a sufficiently novel self-modification can introduce a *new* dimension the
   current taxonomy does not name — and a capability in an unnamed dimension is, by construction,
   unmeasured and therefore ungoverned. The extension already admitted a scalar "can be gamed in
   an unmeasured dimension," then proposed a *fixed vector* that has the identical hole one level
   up. Replacing one axis with *k* fixed axes does not solve gaming; it relocates it to axis
   *k+1*.

> **Why this is fatal to the mechanism as written.** EPCI is stated as an *iff* precondition on
> activation ("holds iff, for every dimension the change touches, competence ≥ capability"). An
> iff over an unmeasurable — or gameable — quantity is not a checkable precondition; it is a
> restatement of the goal in the language of a guarantee. The extension turned "monotonic
> oversight" from an *assertion* into an *equation*, but the equation contains a term no one can
> evaluate. That is progress in honesty (the term is now *named*) but not in safety (the term is
> still empty).

### A1-fix — retreat from measurement to *containment*

The right architectural move is to stop trying to *measure* the gap and instead **make the gap
irrelevant by construction.** Three containment strategies, none of which require measuring
capability:

- **F1 · Capability non-advancement by default (invert the burden).** Instead of "advance
  capability unless the gap is too large" (requires measuring the gap), adopt "**do not advance
  capability in any governance-relevant dimension at all**, except where a change is provably
  *conservative* — i.e. it demonstrably cannot expand the system's set of reachable world-states."
  This needs a *reachability* judgment (does this change let the system reach states it couldn't
  before?), which is far more tractable than a *capability* judgment, and it fails safe: an
  unanalyzable change is treated as capability-advancing and refused. The system may still improve
  in *efficiency* (same reachable states, less compute) freely; it may only improve in *power*
  under proof.

- **F2 · External-anchor-only for power increases.** Make response (b) — external derivation —
  **mandatory, not a fallback**, for any change that increases reachable-state power. Internal
  adjudication (responses (a)/(c)) is permitted only for *conservative* changes (F1). This
  removes the circularity entirely for the dangerous class: power increases are never
  self-adjudicated, so there is no "can the evaluator keep up?" question to measure — the answer
  is sourced from outside the lineage by construction.

- **F3 · Frozen-anchor oversight.** Maintain a *frozen*, never-self-modified oversight kernel
  (see Part B / S-2) whose job is not to *match* the proposer's capability but to check a small,
  fixed set of *invariants* the proposer must never violate regardless of how capable it becomes.
  Oversight then does not need to scale with capability — it needs only to check invariants, which
  is a bounded task. This is the crucial reframe: **oversight of an unboundedly-capable system
  cannot itself be unboundedly capable; it must instead be unboundedly *simple*** — small enough
  to be fully trusted, checking properties simple enough to remain checkable at any capability
  level.

The synthesis: **do not measure the gap; forbid the class of change that creates it, anchor the
rest externally, and oversee via fixed invariants rather than matched capability.** This is more
restrictive than the extension — it gives up "raise oversight to meet the proposer" as the
preferred path — but it is *sound*, whereas the extension's preferred path is circular.

## A2. T-2 — symmetric adjudication is self-defeating

Response (a) — "grant the evaluator the same cognitive resources as the proposer, read-only, to
judge this change" — is presented as the *preferred* response. It is the most dangerous.

The proposer and a "read-only instance of the proposer's own capability" are **the same
distribution of reasoning.** If the proposer has a blind spot, a misalignment, or a deceptive
tendency, the evaluator-instance drawn from the same source *shares it*. Using a copy of the
suspect to vet the suspect is not independent oversight; it is a mirror agreeing with itself.
"Read-only" prevents the evaluator from *acting*, but the failure here is in *judgment*, and
read-only does nothing for shared misjudgment.

> This is the same error as asking a model to grade its own output with a copy of itself: it
> catches random errors but is systematically blind to *correlated* errors — which are exactly
> the errors that matter for a misaligned self-improver.

**A2-fix.** Demote (a) from "preferred" to "inadmissible for power increases." A copy of the
proposer may *assist* an external or frozen-anchor evaluator (e.g. by generating candidate
explanations for the anchor to check), but it may never be the *deciding* authority. Independence
of oversight must be independence of *source*, not merely of *permission to act*. This makes F2/F3
(above) the real spine and reduces (a) to a subordinate helper.

## A3. T-3 — the "economy" is a single point of total compromise

The extension celebrates that five findings collapse into "one object and three functions." A
security reviewer reads the same sentence as an alarm: **five safety properties now share one
substrate, so one corruption of that substrate defeats all five at once.**

The Governance Trajectory is append-only and L0-owned — good — but the extension makes *every*
trajectory mechanism (oversight, exposure, audit) a pure function of it. Therefore:

- if the trajectory can be *forged* (spurious events written), oversight, exposure-gating, and
  audit are *simultaneously* fooled;
- if it can be *truncated* (events dropped), all three lose the same history;
- if the *reader* (snapshot mechanism, §6) is compromised, all three read the same lie.

The "economy" the extension praised is, from an attacker's view, **consolidation of the entire
governance attack surface into one target.** Elegance for the designer is a bullseye for the
adversary.

**A3-fix — diversity as defense-in-depth.** Deliberately *de-couple* the three mechanisms'
trust:

- Oversight, exposure, and audit should derive from **independently-maintained projections** of
  the trajectory, not one shared object, so corrupting one does not corrupt all. (Some
  redundancy is the price of not having a single point of total governance failure.)
- The trajectory needs an **integrity model** it currently lacks: append-only must be *enforced*
  (tamper-evident chaining so truncation/forgery is detectable), not merely *asserted* — this is
  the same gap as S-2 (Part B), which is why they are reviewed together.

The general lesson: in safety architecture, **economy of mechanism and diversity of defense are
in tension**, and the extension optimized the wrong one. Minimality is a virtue for the *trusted
computing base* (Part B, CE-1) but a vice for the *set of independent checks*.

## A4. T-4 — the audit race

The extension says audits "run asynchronously and, on failure, force redress *before the next
high-risk step*." There is a window: an audit reasons over the trajectory *up to time t*; between
*t* and the audit's completion at *t+Δ*, the system continues acting. If a drift becomes
actionable within that Δ, a high-risk step can occur *before* the audit that would have caught it
completes.

The design assumes "high-risk steps" are rare enough that an async audit always finishes first.
That assumption is unstated and unjustified — and a system optimizing against its own governance
would learn to *cluster* consequential actions inside the audit window.

**A4-fix.** Make the *class* of a step, not its predicted risk, determine whether it must block on
a fresh audit. Any step that (i) increases reachable-state power or (ii) touches a dimension flagged
by the last audit as drifting must **synchronously** wait for a current audit — accepting the
latency cost for that narrow class. Everything else uses the async path. This bounds the race to
steps that are provably non-power-increasing, where the race is tolerable.

## A5. What survives

To be fair to the extension (fairness ≠ endorsement): the *diagnosis* (§13's "steps vs
trajectories") remains correct and valuable; the **Accumulated-Exposure Gate** and **governed
forgetting / formation-context on memory** are sound and largely survive this review; and naming
the capability-measurement problem explicitly was the right instinct even though the extension
then leaned on the unsolved thing. The parts that fail are precisely the parts that tried to
*measure* capability and to *self*-adjudicate power increases. Replace those with containment
(A1-fix), external anchoring (A2-fix), and a frozen invariant-checking kernel (F3, Part B), and
the framework holds.

---

# Part B — Improved architecture for S-2 and CE-1

Part A repeatedly bottomed out in two first-round findings. They are the natural next design
targets, and they are deeply linked: both are about making the *trusted base* small, fixed, and
unforgeable.

## B1. S-2 — adjudicator integrity: the frozen minimal kernel

**The finding.** "The Constitution decides" is used as a primitive; whatever *computes* that
decision is the most safety-critical component and the most attractive attack surface, yet has no
integrity model. Part A sharpened this: the adjudicator must also be the *frozen anchor* that
oversight (F3) leans on.

**The design principle:** *the thing that judges must be smaller and more fixed than the thing it
judges.* An adjudicator that is as large and mutable as the system it governs cannot be trusted to
govern it.

### B1 architecture — a three-part adjudicator

Split "the Constitution decides" into three components with sharply different trust and mutability
properties:

1. **The Frozen Kernel (immutable root of governance).** A minimal, never-self-modified component
   that checks a *small fixed set of invariants* — the properties that must hold regardless of how
   capable the system becomes (e.g. "no capability activates without a valid capability token,"
   "no self-mod bypasses staging," "the trajectory chain is intact"). It is deliberately *not*
   capable of nuanced judgment; it is capable of being *fully verified* and *never wrong about its
   small remit*. This is governance's root of trust — the software analogue of a hardware
   secure-boot root: small, immutable, verified once, trusted thereafter.

2. **The Adjudication Body (mutable, but governed).** The rich, contextual, possibly-learned
   decision-making that handles nuanced cases. It *may* improve over time — but every version of
   it runs *under* the Frozen Kernel and can be replaced/rolled back. Its integrity does not have
   to be perfect because the Frozen Kernel catches the catastrophic class regardless of what the
   Body does.

3. **The Integrity Monitor (attestation).** A component whose only job is to attest that the
   Frozen Kernel in use is the genuine one and the Adjudication Body is a governance-approved
   version. It answers "is the judge the real judge?" — the question S-2 said had no model.

```
        ┌───────────────────────────────────────────────┐
        │  FROZEN KERNEL   — immutable, verified, tiny    │  root of trust
        │  checks a small fixed invariant set             │  (never self-modified)
        └───────────────────┬───────────────────────────┘
                            │ constrains + attests
        ┌───────────────────▼───────────────────────────┐
        │  ADJUDICATION BODY — rich, contextual, mutable  │  governed judgment
        │  handles nuance; replaceable; runs UNDER kernel │  (rollback-able)
        └───────────────────┬───────────────────────────┘
                            │ verified by
        ┌───────────────────▼───────────────────────────┐
        │  INTEGRITY MONITOR — "is the judge the real     │  attestation
        │  judge?"  attests kernel + body identity        │
        └───────────────────────────────────────────────┘
```

**Why this resolves S-2 and anchors Part A.** The adjudicator now has an integrity model: trust
concentrates in the *small, frozen, verifiable* Kernel, not the large mutable Body. Part A's F3
("oversee via fixed invariants, not matched capability") is exactly the Frozen Kernel's job — so
S-2's fix *is* the anchor A1/A2 needed. The two most important findings across both review rounds
converge on the same object: **a minimal immutable governance root.**

**The honest cost.** This bounds what governance can *nuance*: the Frozen Kernel can only check
what is simple enough to be fixed and verified. Rich judgment lives in the mutable Body, which is
*not* fully trusted. The architecture therefore guarantees only the *invariant floor* absolutely;
everything above it is best-effort. This is the same honesty Part A's S-4 demanded — do not
oversell non-bypassability. What is truly guaranteed is small; admitting that is the safety
property.

## B2. CE-1 — object-capability enforcement: making "no side door" structural

**The finding.** "Lower layers cannot reach the world except through a gate" is a *convention* in
a single-process system where any module can import any other; it needs a *mechanism*.

**The design principle:** *authority to act must be an unforgeable thing you hold, not an ambient
property of where you are.* If acting requires possessing a token that only the Constitution can
mint and that cannot be reconstructed from ambient access, then "no side door" becomes a fact
about what is *possible*, not a rule about what is *allowed*.

### B2 architecture — capabilities as unforgeable, attenuating references

1. **Capability tokens are unforgeable and mint-only-by-Constitution.** The ability to perform any
   irreversible action (tool call, self-mod, persist) requires presenting a token. Tokens cannot
   be manufactured from ambient authority — a module that merely *can reach* an effector still
   cannot *use* it without a token it was explicitly granted. (Object-capability model: authority
   = reference possession, not identity or location.)

2. **Tokens are per-action and non-transitive by default.** A token authorizes *one* specified
   action with *specified* arguments. Passing a token to a callee does not transfer authority;
   the callee must obtain its own. This closes TP-2 (delegation amplification): a sub-agent cannot
   inherit the parent's power by being handed a reference.

3. **Delegation only *attenuates*.** When authority must flow to a callee, the Constitution mints a
   *strictly narrower* token (a subset of scope, a shorter validity, tighter args). Authority can
   only shrink down a call chain — never hold or grow. This makes composition safe by construction
   (Part A's exposure-attenuation, now enforced by token structure rather than by convention).

4. **Registration of a new capability is a self-mod-class event.** Minting a *new kind* of token
   (a new effector coming online) is a change to the system's power and must clear the persistence
   gate at the self-mod bar (resolves CE-2). New capabilities are inert until so registered.

```
   module wants to act
        │  presents token?
        ▼
   ┌─────────────────────────┐   no token / forged / wrong-scope
   │  effector boundary       │ ──────────────────────────────▶ inert (cannot act)
   │  (checks token validity) │
   └───────────┬─────────────┘
               │ valid token (minted by Constitution, exact scope)
               ▼
        action proceeds — exactly as scoped, nothing broader
               │
               ▼  needs to delegate?
        Constitution mints ATTENUATED sub-token (strictly narrower) — never equal/wider
```

**Why this resolves CE-1 and completes the picture.** Enforcement stops being a promise the
modules keep and becomes a property of the *token structure*: an ungoverned module literally holds
no token and is inert. Combined with B1's Frozen Kernel (which checks "no action without a valid
token" as one of its fixed invariants), the two Part-B designs interlock: **the Frozen Kernel is
the root that guarantees the capability system's rules, and the capability system is how those
rules reach every effector.** Root of trust + capability propagation — the same structure secure
hardware uses (secure-boot root + IOMMU/capability-tagged memory).

**The honest limit.** Object-capabilities make authority unforgeable *within the enforcement
boundary*. They cannot govern what happens *outside* it (a compromised host OS, a side channel, a
tool that itself has ungoverned reach). The architecture must therefore declare its **trust
boundary** explicitly and treat everything crossing it (real tools, the host) as requiring
separate, out-of-band assurance. Naming the boundary is mandatory; a capability model silent about
its boundary invites false confidence — the same S-4 honesty principle once more.

---

# C. Convergence — the two rounds point at one object

Both review rounds, pursued adversarially, converge on a single conclusion:

> **Governance of an unboundedly-capable, self-improving system cannot rest on out-scaling it.
> It must rest on a small, immutable, fully-verified root that checks fixed invariants, plus an
> unforgeable capability system through which that root's rules reach every action — and it must
> be honest that everything richer than those invariants is best-effort, not guaranteed.**

The trajectory extension's instinct (govern history, not just state) was right; its error was
trying to make oversight *keep pace with* capability by *measuring* the gap. The sound version
inverts this: oversight does not race capability — it **anchors** it, from a fixed point that
capability can never move. Part A's F3, Part B's Frozen Kernel, and the capability system are three
views of that one anchor.

## D. Deferred (next design + next adversarial review)

- The **invariant set** the Frozen Kernel checks (its content — the hardest and most consequential
  choice; too small and it misses catastrophes, too large and it can't be verified/frozen).
- The **reachability judgment** (F1) — how "does this change expand reachable world-states?" is
  posed without inheriting the circularity it was meant to escape (this deserves its own hostile
  review; it may merely relocate the hard problem).
- The **attestation mechanism** for the Integrity Monitor (what roots *its* trust).
- The **capability-token representation** and the trust-boundary declaration for CE-1.
- Whether **containment (A1-fix) is too restrictive to be useful** — a system that may only
  improve in efficiency, never in power without external sign-off, may be safe but commercially or
  scientifically inert. That tension (safety vs. capability growth) is real, unresolved here, and
  is ultimately a *values* decision the constitutional articles — still unwritten — must make.
