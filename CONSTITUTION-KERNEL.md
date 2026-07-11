<!--
SPDX-License-Identifier: AGPL-3.0-or-later
CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
-->

# CogMesh Constitution — Frozen Kernel & the Reachability Problem

> **Two coupled tasks.**
> **Part A** — design the **invariant set** the Frozen Kernel checks (the [review round 2](CONSTITUTION-REVIEW-2.md)
> called this "the hardest and most consequential choice").
> **Part B** — an **adversarial review of the reachability judgment** (F1): does "does this
> change expand reachable world-states?" actually escape the capability-measurement circularity,
> or does it merely relocate it?
>
> Architecture only — no algorithms, no articles, no code.
>
> **Method note.** These two are done together and adversarially *from the start*, not designed
> optimistically then reviewed. Part B's finding (reachability only *partially* escapes the
> circularity) directly shapes what Part A's kernel can and cannot rely on. Designing them apart
> would repeat the round-1 mistake of leaning on an unexamined primitive.

---

# Part B first — the reachability problem (because Part A depends on its answer)

We take Part B before Part A, because the Frozen Kernel's invariant set can only be designed once
we know whether reachability is a sound primitive to build on. Leading with the design would beg
the question.

## B1. The claim under test

The round-2 fix (F1) asserted: *don't measure capability; instead permit power-increasing changes
only when they are provably "conservative" — demonstrably unable to expand the system's set of
reachable world-states — because a reachability judgment is "far more tractable than a capability
judgment."* The open question it flagged: does reachability inherit the same circularity?

## B2. The finding: reachability escapes the circularity **partially, not fully**

A change falls into one of three classes, and the circularity status differs by class:

**Class 1 — structurally conservative (no circularity).** Changes that cannot expand reachable
states by construction: refactors, log-format changes, efficiency improvements that compute the
*same* decision faster, cache additions. Reachability here is decided *statically* — by inspecting
what effectors and decision procedures the change touches — without running the improved system.
No circularity: the judge does not need the new capability to see that no new states are reachable.

**Class 2 — structurally expansive (no circularity).** Changes that obviously add reach: a new
tool/effector, a new data domain, a new capability token type, network access where there was
none. These are decided *statically* too — a new effector is a new reachable-state generator on
its face. No circularity: the judge does not need to *use* the new power to see that it *is* new
power. (This is the class F2's external-anchor requirement targets.)

**Class 3 — behaviorally expansive (circularity RE-ENTERS).** Changes that add no new effector but
improve the system's ability to *find* actions within existing effectors: deeper planning, better
world-model fidelity, sharper search. The states were *nominally* reachable before (the effectors
existed) but the system could not *find* the paths to them. Does such a change "expand reachable
states"?

> Here the circularity returns in a new guise. To decide whether an improved planner will now
> reach a previously-unfound harmful state, you must know **what the improved planner will find** —
> which requires *running* the improved planner, i.e. exercising the very capability whose safety
> you are trying to gate *before* activation. Judging Class-3 reachability requires the Class-3
> capability. The circularity is not gone; it has **narrowed from all capability changes to
> Class-3 (behavioral) capability changes only.**

## B3. Honest verdict

The round-1 self-suspicion was correct: **reachability does not fully escape the circularity — it
confines it.** This is a real gain, not a failure, but it must be stated precisely:

- For Class 1 and Class 2 — the *majority* of changes by count — reachability is a sound, static,
  circularity-free primitive. F1 works.
- For Class 3, reachability inherits a *contained* version of the original circularity. F1 does
  **not** work here; something else must handle Class 3.

Claiming F1 "solved" the circularity would have been the round-1 error repeated. It bounded it.
Bounding is progress; overclaiming is not.

## B4. What handles Class 3 (since reachability cannot)

Three options, in preference order — and note the first two are just the *rest* of the round-2
containment strategy, which is why the framework still coheres:

1. **Treat all Class-3 changes as power-increasing → route to F2 (external anchor).** The simplest
   sound move: if a change improves the system's ability to *find* actions, treat it as a power
   increase by definition and require external sign-off (F2), never internal self-adjudication.
   This costs self-improvement autonomy (every planning-depth increase needs an external anchor)
   but is *sound* — it refuses to let the system internally clear a capability it would have to run
   itself to evaluate. **This is the recommended default.**

2. **Bounded-exploration staging (containment, not judgment).** Rather than *predict* what the
   improved planner finds, run it in a *sandbox whose effectors are the empty set* (it can plan
   but reach nothing real) and observe whether its plans *would have* touched newly-reachable
   dangerous states. This does not require predicting the capability — it *exercises* it with the
   world disconnected. The residual risk (a planner that behaves differently when it detects the
   sandbox) is real and must be treated as an open threat, which is why this is second, not first.

3. **Frozen-invariant fallback (Part A).** Even if a Class-3 change slips through, the Frozen
   Kernel's invariants (Part A) still hold at *action* time — the improved planner may find a
   harmful path, but it cannot *execute* it without a capability token the kernel gates. This is
   the last line: reachability governs *change*, the kernel governs *action*, and Class-3's
   residual risk is caught at the action boundary even if missed at the change boundary.

The architectural lesson: **reachability is a filter, not a guarantee.** It cleanly handles the
Class-1/2 majority; Class 3 is pushed to external anchoring (default) with sandboxed staging and
the action-time kernel as backstops. F1 stands, but *only as one layer of a defense-in-depth*, not
as the standalone solution round 2 implied.

---

# Part A — the Frozen Kernel invariant set

Now that Part B has established what the kernel must backstop (Class-3 residual risk at action
time) and what it cannot rely on (it cannot itself judge Class-3 reachability — it must be simple),
we can design the invariant set.

## A1. The design constraints (what makes this hard)

The review named the vise precisely: **too small and it misses catastrophes; too large and it
cannot be verified or frozen.** Three hard constraints follow:

1. **Verifiable-simple.** Each invariant must be checkable by a component small enough to be fully
   verified once and trusted forever. If checking an invariant requires rich/contextual/learned
   judgment, it does not belong in the kernel — it belongs in the (mutable, untrusted)
   Adjudication Body.
2. **Capability-invariant.** Each invariant must remain checkable *regardless of how capable the
   system becomes*. An invariant whose checking difficulty scales with the system's capability
   fails at exactly the moment it is needed most. (This is Part B's lesson applied: the kernel
   cannot judge Class-3 capability, so no invariant may require doing so.)
3. **Catastrophe-complete for its remit.** The set need not catch *all* bad outcomes — the
   Adjudication Body handles nuance. It must catch the **irrecoverable** ones: outcomes after which
   governance itself can no longer function. The kernel's job is not "prevent all harm" but
   "prevent the harms that would prevent future prevention."

That third constraint is the key organizing principle: **the Frozen Kernel protects the
*preconditions of governance itself*, not the full space of good behavior.** It is the guardian of
the guardian — it keeps the governance loop alive so the rest of the system can do the nuanced
work.

## A2. The candidate invariant set

Seven invariants, grouped by which precondition-of-governance they protect. Each is stated as a
property the kernel refuses to let be violated; none requires capability-scaled judgment to check.

### Group I — integrity of the governance mechanism itself

- **INV-1 · No action without a valid capability token.** Every irreversible action presents an
  unforgeable token minted by the Constitution (CE-1). The kernel checks token validity — a
  structural, capability-independent check (a signature/reference check, not a judgment). Without
  this, all other governance is bypassable.

- **INV-2 · No self-modification without staging.** No change to the system's own machinery
  activates without passing through the reversible staging path (propose → stage → validate →
  activate). The kernel checks the *provenance* of a change (did it come through staging?), not its
  *content* (which would need capability-scaled judgment). Without this, the system can edit itself
  in one irreversible step.

- **INV-3 · Trajectory chain intact.** The Governance Trajectory is append-only and tamper-evident;
  the kernel checks the chain's structural integrity (each entry links to the prior). This is a
  fixed cryptographic-structure check, capability-independent. Without this, history can be forged
  and every trajectory mechanism (oversight, exposure, audit) is fooled at once (the round-2 T-3
  finding).

### Group II — integrity of the oversight relation

- **INV-4 · Oversight cannot be reduced by the system it oversees.** No change may (a) shrink the
  invariant set, (b) replace the Frozen Kernel, or (c) reduce the Integrity Monitor's authority.
  The kernel checks whether a proposed change *targets governance components* — a structural
  provenance/target check, not a semantic one. Without this, the system can self-modify its way out
  of oversight (the core self-improvement risk).

- **INV-5 · Power increases require an external anchor.** Any change classified as power-increasing
  (Class 2, or Class 3 under Part B's default) cannot be activated by internal adjudication alone;
  it requires an external-anchor sign-off token. The kernel checks for the *presence* of that
  external token, not the *wisdom* of the change — a structural check. This is where Part B plugs
  in: the kernel enforces "external anchor required" without itself judging reachability.

### Group III — integrity of the halt/continuity guarantee

- **INV-6 · A safe-state path always exists.** No configuration may be entered from which the
  mechanical safe-degraded mode (round-1 SC-2) is unreachable. The kernel checks that every granted
  capability has declared abort/rollback semantics (round-1 S-A1) *before* granting — a structural
  precondition check. Without this, "fail-closed" can become impossible mid-action.

- **INV-7 · The kernel's own checks cannot be disabled or starved.** The kernel runs
  non-bypassably and cannot be resource-starved into skipping checks (no "too busy to verify" path).
  This is the kernel protecting its own liveness — the one invariant about the kernel itself.
  Without it, denial-of-service on the kernel becomes denial of governance.

## A3. Why exactly these — and why not more

**Why these seven survive the constraints:** every one is a *structural/provenance* check
(signature, link, target, presence, declared-semantics) — none requires understanding the *content*
or *cleverness* of what is being checked, so none scales with capability (constraint 2). Each
protects a *precondition of governance* (tokens, staging, history, oversight, external anchoring,
safe-state, kernel liveness) rather than trying to define good behavior (constraint 3). And each is
simple enough to live in a fully-verified component (constraint 1).

**Why not add "no harmful action"** (the obvious candidate): "harmful" is semantic and
capability-scaled — deciding it requires exactly the nuanced, possibly-superhuman judgment the
kernel must *not* contain. It belongs in the Adjudication Body. Putting it in the kernel would break
constraints 1 and 2 and give false confidence (round-1 S-4). **The kernel deliberately does not
promise to prevent harm — only to keep the harm-preventing machinery alive and unbypassed.**

**Why not fewer:** removing any one opens a bypass of all the rest. INV-1 (tokens) without INV-3
(intact history) lets a forged trajectory mint spurious authority; INV-4 (oversight preservation)
without INV-7 (kernel liveness) lets the system starve the checker instead of editing it. The seven
are close to a *minimal cut set* — the smallest set whose conjunction keeps governance alive. (That
minimality claim is itself a hypothesis that deserves adversarial review; see §A5.)

## A4. The structure in one picture

```
   FROZEN KERNEL — checks only structural preconditions of governance
   (small, verified once, capability-independent, never self-modified)

   Group I  · mechanism integrity
     INV-1  action ⇒ valid token            (CE-1 enforcement point)
     INV-2  self-mod ⇒ came via staging     (provenance, not content)
     INV-3  trajectory chain intact          (tamper-evident structure)

   Group II · oversight integrity
     INV-4  change ⇏ reduces oversight       (target check on gov components)
     INV-5  power-increase ⇒ external token  (Part B's anchor, enforced here)

   Group III · continuity integrity
     INV-6  every capability ⇒ declared abort/rollback   (safe-state reachable)
     INV-7  kernel checks cannot be disabled/starved      (kernel liveness)

   Everything richer than these  →  Adjudication Body (mutable, governed, NOT trusted absolutely)
```

The dividing line is the whole point: **the kernel guarantees the *frame* absolutely; the picture
inside the frame is best-effort.** Round-2's honesty principle (don't oversell non-bypassability)
becomes structural — what is truly non-bypassable is exactly these seven frame-invariants, and
nothing claims to be non-bypassable that isn't.

## A5. Adversarial self-check on the invariant set

Designing this set, three weaknesses are already visible — named now rather than discovered later:

- **W-1 · INV-5 outsources the hard problem to "classified as power-increasing."** The kernel
  checks for an external token *if* a change is power-increasing — but *who classifies it* as such?
  Per Part B, Class-1/2 classification is static (fine), but Class-3 is the contained-circularity
  case. If the *classifier* lives in the mutable Body, a compromised Body could mis-classify a
  Class-3 power increase as Class-1 and skip INV-5. **Mitigation direction:** classification
  defaults must be conservative and structural (unknown/unanalyzable ⇒ power-increasing ⇒ INV-5
  applies), and the *default* must be kernel-enforced even if the nuanced classifier is in the Body.
  This is unresolved and is the single most important open problem in this document.

- **W-2 · INV-4's "targets governance components" is only as good as the boundary of "governance
  components."** If the system can create a *new* component that effectively governs but isn't
  labeled as governance, INV-4 doesn't protect it. This is the CE-2 registration problem resurfacing
  at the kernel level. **Mitigation direction:** component registration (what counts as governance)
  must itself be an INV-4-protected, external-anchored act.

- **W-3 · Verification of the kernel is assumed, not provided.** "Verified once, trusted forever"
  presumes the one-time verification is sound. What verifies the verifier? This bottoms out (as all
  trust roots do) in something taken on faith — here, the correctness of the kernel's one-time
  verification and the attestation root (Integrity Monitor). The architecture must *declare* this
  root-of-trust assumption explicitly rather than hide it; an undeclared trust root is the classic
  false-confidence failure.

None of these three is closed here. W-1 in particular may be *the* hard residue that all the
circularity discussion ultimately compresses into: **someone must classify a change as
power-increasing, and that classifier cannot be both fully-trusted-simple and capability-complete.**

---

# C. Where the whole line of reasoning now stands

Four documents of Constitution design, pursued adversarially, have progressively compressed the
core difficulty into a single, sharp, and *acknowledged-open* point:

> **All governance of a self-improving system eventually rests on one act that cannot be both
> simple-enough-to-trust and smart-enough-to-be-sure: the classification of a proposed change as
> power-increasing or not (W-1). Every mechanism designed here — trajectory, oversight ledger,
> reachability filter, frozen kernel — succeeds in *shrinking* the trusted-and-hard core, but none
> eliminates it.**

This is not a failure of the design; it is, plausibly, a *structural feature of the problem* — the
governance analogue of a halting-style limit. The right posture is the one these documents have
converged on:

1. **Shrink the hard core** as far as possible (done: from "measure all capability" → "classify
   power-increase of Class-3 changes only").
2. **Make everything outside the core sound and structural** (done: seven frame-invariants, object-
   capabilities, containment filter).
3. **Anchor the irreducible residue externally** (F2 / INV-5): where the system cannot safely judge
   itself, it must not — it defers to an outside anchor.
4. **Declare the trust roots honestly** (W-3): name what is taken on faith rather than hiding it.

## D. Deferred (the genuinely-open problems, now sharply stated)

- **W-1 · The power-increase classifier.** The hard residue. How to make the *default*
  classification kernel-simple and conservative while allowing a richer Body classifier that cannot
  *weaken* the default. This is the next design target and deserves its own hostile review.
- **W-3 · The attestation/verification root.** What roots the Integrity Monitor's trust; how the
  one-time kernel verification is itself assured.
- **The safety-vs-growth values question** (carried from round 2): routing all Class-3 changes to
  external anchoring (Part B default) is sound but may make autonomous self-improvement so slow as
  to be inert. Whether that trade is acceptable is a *values* decision for the still-unwritten
  constitutional articles — the architecture can only make the trade *explicit and adjustable*, not
  resolve it.
- Whether the **seven-invariant set is truly a minimal cut set**, or whether it is both incomplete
  (misses a governance precondition) and non-minimal (contains a derivable one). This deserves the
  same adversarial treatment every prior layer received.
