<!--
SPDX-License-Identifier: AGPL-3.0-or-later
CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
-->

# CogMesh Constitution — Attacking the Termination Argument

> **Target.** The §6 self-directed task from [CONSTITUTION-COVERAGE.md](CONSTITUTION-COVERAGE.md):
> attack the claim that the recursion terminates at the effect-closure coverage check — hunt for a
> hard point that is "static yet still circular, or dynamic yet unnoticed."
>
> Architecture only — no algorithms, no articles, no code.
>
> **Result up front, because the honest result is the finding.** *The termination argument as stated
> was wrong.* A real counterexample exists — and it is not an exotic edge case but the **single most
> important case for a self-improving system: learning.** The coverage check as designed would
> wrongly certify a weight update as conservative. This document establishes the counterexample,
> traces exactly which premise fails, repairs the coverage check, and then re-examines whether the
> repaired design truly terminates — with more caution this time, having just been wrong.

---

## 1. The claim, and the shape of a refutation

The termination argument was: the recursion ends at the effect-closure check because that check is
the first *static* question, and "only dynamic questions were ever circular." It rests on two
premises:

- **P1** — static questions do not spawn circular sub-questions.
- **P2** — the effect closure ("what can this change touch?") is a purely static question that
  suffices for the coverage check.

Either premise failing breaks termination. Four attacks were run; three failed to break it, one
succeeded. The successful one breaks **P2** — and does so through the case that matters most.

## 2. The failed attacks (reported for honesty)

Three lines of attack did *not* break the argument, and saying so is part of an honest review:

- **A1 (dynamic code generation).** In a self-modifying system, `eval`/reflection/dynamic dispatch
  can make the static reference graph incomplete. But this degrades *precision*, not *soundness*:
  an incomplete graph is over-approximated ("if unsure, include it"), which fails safe toward
  "power-increasing." It makes the system more *inert*, not more *unsafe*. No circularity; P1/P2
  survive this one.
- **A2 (who checks the static analyzer?).** "Is the effect-closure analyzer itself sound?" is a
  static-yet-circular-looking question. But it is **not new** — it is exactly W-3 (the trust root),
  already designed as tamper-evident/external. The coverage check *uses* W-3; it does not spawn a
  fresh trust root. Already accounted for (§4-β of the coverage doc).
- **A4 (is the static/dynamic dichotomy complete?).** Suggestive — a self-modifying system's
  "static" structure itself changes over time, hinting at a third category. But this turns out to be
  a symptom of the real flaw (A3 below), not an independent one; on its own it is a worry, not a
  counterexample.

## 3. The successful attack: the effect closure captures *reach*, not *behavior*

### 3.1 The counterexample — a weight update

Consider the most ordinary self-improvement step imaginable: the system updates a learned weight
vector, W_old → W_new. No code changes; only a data array changes.

Run the effect-closure coverage check on it:

- **What does the change touch?** The static graph says: the functions that read W — say,
  `policy_net()` — and whatever state those functions access. The code is byte-identical, so the
  reference graph is identical, so the effect closure is **unchanged**.
- **Verdict:** the change touches nothing new → coverage holds → **CONSERVATIVE** → activates
  autonomously, no external anchor.

This is a **false negative — the catastrophic error class.** A weight update can transform
`policy_net` from cautious to reckless, from aligned to misaligned, while touching *exactly the same
state*. The behavior changed completely; the reach did not.

### 3.2 The precise premise failure

P2 is false. The effect closure answers **"what can this change *touch*?"** (reach) — but coverage
soundness actually requires **"can this change alter *behavior within* what it touches?"**
(behavior-in-reach). These come apart exactly for changes that hold reach fixed while altering the
behavior-determining state inside it:

> **A learned weight is behavior-determining state that lives *inside* the effect closure, not at its
> boundary. Changing it changes behavior without changing reach. The effect closure — a reach
> property — is structurally blind to it.**

And the circularity returns in full: to know whether W_new produces dangerous behavior, you must run
`policy_net(W_new)` — exercise the improved capability — which is the original dynamic, circular
question. The static effect closure did not *dissolve* this question; it simply *failed to ask it*.

### 3.3 Why this is the worst possible place to be wrong

Reach-changing modifications (new tools, new data domains) are the *easy* case — they are visibly
Class-2 and get anchored. **Behavior-in-reach changes are the essence of learning**, which is the
core of self-improvement. So the termination argument failed precisely on the modification type a
self-improving system performs most, and fails toward *false-negative* (unsafe), not false-positive
(inert). The elegant "descent to static" argument was elegant because it quietly restricted itself
to reach, and reach was never where learning's danger lived.

## 4. The repair — and why it is not just a patch

### 4.1 What was missing

The coverage check conflated two distinct conservativeness conditions:

- **Reach-conservative:** the change touches no new state (what effect closure checks).
- **Behavior-conservative:** the change alters no behavior-determining state within reach (what it
  *failed* to check).

A change is genuinely conservative only if it is **both**. The design had the first and silently
assumed it implied the second. It does not.

### 4.2 The repaired coverage check

Coverage must range over the **behavior-determining state** of the change, not only its reach. In
addition to "does the derivation account for the whole reach?", the check adds: **does the change
modify any behavior-determining state (learned weights, policies, decision thresholds, the reasoning
machinery) — and if so, it is NOT reach-conservative-therefore-safe; it is Class-3 and must route to
the external anchor.**

Concretely, the repair is a *classification* the kernel can still make statically: a change to
anything tagged behavior-determining (weights, policy tables, search parameters, the model itself) is
*by structural type* treated as behavior-altering → power-increasing → external anchor. The kernel
does not need to *evaluate* the new behavior (that would be the circular dynamic question); it only
needs to *recognize that behavior-determining state was touched* — a static, structural check on
*which kind of state* changed, not on *what the change will do*.

```
   change ──▶ static classification of WHAT KIND of state it modifies:
                 │
                 ├─ only non-behavior-determining state (code layout, caches, logs)?
                 │       └─ reach-check + behavior-check both trivially conservative → CONSERVATIVE
                 │
                 ├─ reach expands (new effector/domain)?          → POWER-INCREASING → anchor
                 │
                 └─ behavior-determining state changes            → POWER-INCREASING → anchor
                    (weights, policy, thresholds, the model)         (this is the repair)
```

### 4.3 Why the repair restores soundness *and* stays static

The repair keeps the kernel's judgment static: "is this state tagged behavior-determining?" is a
structural property (a type/label on state), not a behavioral prediction. The kernel never asks "what
will the new weights do?" (circular); it asks "did the change touch weights *at all*?" (static). If
yes, it declines to self-certify and routes to the anchor. **Soundness is restored by treating all
behavior-determining changes as power-increasing by default** — the same conservative-
over-approximation move, now applied to the behavior dimension the reach analysis missed.

The honest cost is exactly the safety-vs-autonomy dial again, and now it *bites where it matters*:
**every learning update routes to the external anchor by default.** A system cannot autonomously
self-improve its own weights without external sign-off. This is severe — it may make autonomous
learning impractical — but it is *sound*, and the severity is the true price of the safety the whole
architecture promised. The earlier design hid this price by mis-certifying learning as conservative;
the repair surfaces it.

## 5. Does the *repaired* design terminate? (more cautiously this time)

Having just been wrong about termination, the claim is made more carefully.

The repair converts the missed question ("does behavior change?") from a *dynamic* question (run the
weights) into a *static* one (are behavior-determining tags touched?). So the same descent-to-static
structure applies — **but only if the "behavior-determining" tagging is itself static and sound.**
That is the new load-bearing point, and it must be interrogated, not assumed (the exact error just
made):

- **Is "which state is behavior-determining" a static property?** Mostly yes — it is a structural
  classification of state (this array is model weights; this table is a policy). But there is a
  residual worry symmetric to A3: could a change make *previously-inert data* become
  behavior-determining (e.g., a config value that a later change wires into the decision path)? If
  so, the tag itself is not static-forever.
- **Mitigation (and its honesty):** treat the *tagging* conservatively too — any state whose
  behavior-determining status is uncertain is tagged behavior-determining (over-approximate → route
  to anchor). This preserves soundness and keeps the question static, at further autonomy cost.

So the repaired design **plausibly** terminates, by the same static-descent logic, *provided* the
behavior-determining tag is soundly over-approximated. But note the pattern: **this is the third time
the same move (conservative static over-approximation) has been needed one level deeper.** That
recurrence is itself the real lesson (§6).

## 6. The deeper lesson — termination was the wrong thing to claim

The most important finding is not the weight-update hole; it is what the hole reveals about the whole
seven-document arc:

> **There is no clean "floor" where circularity vanishes. At every level, the circularity is escaped
> only by a conservative static over-approximation — and each such over-approximation defines a new
> boundary (reach, then behavior-determining state, then …) whose *own* soundness requires the same
> move one level deeper. The recursion does not bottom out in a static bedrock; it *converges*, each
> layer smaller than the last, but never reaching exactly zero.**

This is a different and more honest claim than "it terminates at the effect closure":

- The earlier claim: the descent **halts** at a static bedrock. **(Shown false.)**
- The corrected claim: the descent **converges** — each conservative over-approximation shrinks the
  residual circularity, but a residue always remains one level down, handled by over-approximating
  again (at cumulative autonomy cost). Safety is achieved not by reaching a circularity-free floor
  but by **driving the residual circularity small enough, and always failing safe (toward
  power-increasing) on whatever residue remains.**

In control terms: it is not a system that reaches equilibrium and stops; it is a *contraction* that
gets arbitrarily close to safe with each layer, where the remaining gap is always covered by
conservative escalation to the external anchor. **The external anchor is not the base case of a
terminating recursion; it is the catch-all for the never-quite-zero residue of a converging one.**

That reframing is the actual result of attacking the termination argument: not a repaired floor, but
the recognition that there is no floor — only convergence plus fail-safe escalation. This is *weaker*
than the coverage doc claimed and *more likely to be true*, which is the trade the whole review line
has repeatedly found correct.

> **⚠ Correction (added later).** This convergence claim was itself **attacked and found wrong** in
> [CONSTITUTION-CONVERGENCE.md](CONSTITUTION-CONVERGENCE.md). Convergence assumed a smooth spectrum
> that does not exist: a sound over-approximation of "behavior-determining state" tags *nearly
> everything* in a fluid-boundary system, so the recursion does not contract — it **saturates
> immediately** (safe but inert). What replaces convergence is a **dichotomy/partition principle**:
> safety and open-ended autonomous self-improvement do not overlap; autonomy is available only in
> regions frozen against boundary-rewriting. Read this section as superseded by that document.

## 7. What now stands, and what is deferred

**Stands (corrected):**
- The coverage check is repaired to treat behavior-determining state changes (learning!) as
  power-increasing by default — closing the false-negative hole.
- The architecture's guarantee is restated honestly: not "circularity terminates," but "circularity
  converges, and all residue fails safe to the external anchor."

**Deferred:**
- **The behavior-determining tagging** — its sound static over-approximation, and the worry that
  inert data can become behavior-determining (§5). The new narrowest point; deserves its own attack.
- **The autonomy collapse** — if *every* learning update needs external sign-off (§4.3), is the
  system autonomously improvable at all? This sharpens the safety-vs-growth tension from
  "uncomfortable" to "possibly prohibitive," and is now unavoidably a *values* decision for the
  unwritten articles.
- **The convergence claim itself (§6)** — "it converges rather than terminates" is now the load-
  bearing meta-claim. It should be attacked exactly as the termination claim was: is there a level
  where the over-approximation does *not* shrink the residue — where the descent stops contracting?
  If so, convergence fails too, and the design is not merely floor-less but *non-convergent*, which
  would be a genuinely different (and worse) result. That is the next hostile review.
