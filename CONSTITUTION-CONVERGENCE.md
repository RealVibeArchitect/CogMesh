<!--
SPDX-License-Identifier: AGPL-3.0-or-later
CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
-->

# CogMesh Constitution — Attacking the Convergence Claim

> **Target.** The §7 self-directed task from [CONSTITUTION-TERMINATION.md](CONSTITUTION-TERMINATION.md):
> attack the fallback claim that the recursion, though it does not *terminate*, at least *converges*
> (each conservative over-approximation shrinks the residual circularity toward zero). Find a level
> where the over-approximation does **not** shrink the residue.
>
> Architecture only — no algorithms, no articles, no code.
>
> **Result up front.** *The convergence claim is also wrong* — and it fails in a way that is more
> informative than the termination failure. Convergence assumed a smooth spectrum between "fully
> safe" and "fully autonomous" that **does not exist.** What actually exists is a **dichotomy**
> forced by how self-modifying the system is: a system whose data/code boundary is fixed has a
> *shallow* recursion (safe and useful, but limited self-improvement), and a system whose boundary is
> fluid **saturates immediately** (every change is potentially power-increasing, so everything routes
> to the anchor → safe but inert). There is no convergent middle. The "safety-vs-autonomy dial" that
> eight documents assumed turns out not to be a dial at all.

---

## 1. The claim as a mathematical statement

"It converges" is not a metaphor to wave at; it is a mathematical claim, and mathematical claims can
be checked against their own preconditions. Convergence-by-contraction (the sense the termination doc
intended — "each layer smaller than the last, never reaching exactly zero") requires, in the manner
of a contraction mapping:

- **E1 — a metric.** There is a well-defined "size of residual circularity" to shrink. Without a
  metric, "smaller each layer" is meaningless.
- **E2 — a contraction factor.** Each layer multiplies the residue by some k < 1. If a layer can
  leave the residue the same size (k ≈ 1), the sequence does not converge.
- **E3 — monotonicity.** The residue decreases without oscillation; later layers do not re-inflate
  what earlier layers shrank.

The convergence claim asserted all three implicitly. At least two fail.

## 2. E1 fails softly: there may be no metric

"The residue gets smaller — reach, then behavior-determining state, then the tagging of that state, …"
*reads* like a decreasing sequence, but nothing defines the *size* being compared. Is "the tagging
problem" smaller than "the behavior problem"? They are different problems, not measured quantities on
a common scale. The intuition of shrinking may be **an ordering mistaken for a metric** — the layers
form a sequence (each is *about* the previous), but "sequence" does not imply "decreasing magnitude."

This alone does not refute convergence (maybe a metric exists), but it removes the claim's
foundation: **convergence was asserted without ever defining what converges.** That is the same
species of error as round 5's "same anchor" — an elegant word ("converges") standing in for an
unestablished quantity.

## 3. E2 fails hard: the immediate-saturation counterexample

The decisive attack. Consider the layer the termination doc itself introduced as the new narrowest
point: **behavior-determining tagging** — the static classification "is this state behavior-
determining?", soundly over-approximated ("if unsure, tag it behavior-determining → route to
anchor").

Now ask what that over-approximation actually captures in a genuinely self-modifying system:

> In a system that can rewire itself, **almost any state is *potentially* behavior-determining** —
> a config value inert today can be wired into the decision path by a later change; a data table can
> become a policy; a logged number can become a threshold. A *sound* over-approximation must
> therefore tag *almost everything* as behavior-determining, because it cannot rule out future
> wiring without predicting future changes (the original dynamic, circular question).

The consequence is fatal to contraction: the over-approximation does not shrink the residue to a
small remainder — it **inflates it to nearly everything.** k is not < 1; k ≈ 1. Worse, the *next*
layer inherits the same "nearly everything," so there is no decreasing sequence at all. The recursion
does not converge; it **saturates at the first step**: nearly every change is tagged power-increasing,
nearly everything routes to the external anchor.

This is safe — nothing dangerous self-certifies — but it is **inert**: the system can autonomously
change almost nothing. "Convergence toward safe-and-autonomous" was the wrong picture; the reality is
**immediate saturation to safe-and-frozen.**

## 4. E3 also wobbles: the layers are not independent

A smaller but real point. The behavior-tagging layer can *invalidate an assumption of the reach
layer*: reach analysis treated some state as "pure data" (not affecting behavior), but behavior
tagging may later classify that same state as behavior-determining. So a later layer *re-inflates* a
distinction an earlier layer relied on — the layers are coupled, not a clean monotone descent. Even
if a metric existed (E1) and some layer contracted (E2), coupling permits oscillation (E3 fails).
Convergence needs all three; it has, at best, none cleanly.

## 5. What replaces convergence: a dichotomy, not a spectrum

The fair question — *does convergence ever hold?* — has a revealing answer. Whether the recursion
saturates depends on **one property the architecture does not control: how fluid the system's
data/code boundary is.**

- **Fixed-boundary system** (data is never silently promoted to behavior-determining; a clear,
  enforced separation): behavior-determining state is *well-defined and small*, so its
  over-approximation is *tight* — only actual weights/policies get tagged, everything else
  self-certifies. This looks like success — but it is not "convergence." It is a **shallow
  recursion**: the boundary was fixed from the start, so the deep tower of hard points never had to
  be descended. Safe and useful, but the system is only weakly self-modifying (it cannot rewire its
  own data/code boundary).

- **Fluid-boundary system** (any state can become behavior-determining via later self-modification —
  the essence of a *strongly* self-improving system): the over-approximation must tag nearly
  everything (§3) → immediate saturation → safe but inert.

So the two regimes are:

| | Fixed boundary | Fluid boundary |
|---|---|---|
| Self-modification power | limited (can't rewire own boundary) | strong (can rewire anything) |
| Over-approximation tightness | tight | tags nearly everything |
| Result | safe **and** useful | safe **and** inert |
| Recursion behavior | shallow (never deep) | saturates at step 1 |

**There is no convergent middle regime** — no setting where the system is *strongly* self-modifying
*and* the recursion contracts to a small-but-nonzero autonomous residue. The convergence claim
imagined exactly that nonexistent middle.

## 6. The deepest conclusion the whole line has reached

Eight documents called the tension between safety and autonomy a **dial** — an adjustable setting the
constitutional articles would choose. Attacking convergence reveals that framing is wrong too:

> **Safety-vs-autonomy is not a dial; it is a dichotomy forced by the degree of self-modification.
> The more a system can rewire itself (the more its data/code boundary is fluid), the more of its own
> changes are potentially power-increasing, until — at the level of genuinely open-ended self-
> improvement — *all* changes are potentially power-increasing and must be externally anchored. A
> sufficiently self-modifying system cannot be both safe and autonomously self-improving. Not because
> the architecture is inadequate, but because soundness itself forces it: you cannot conservatively
> certify "this rewrite won't increase my power" about a system that can rewire what counts as power.**

This is stronger and bleaker than "there is a dial to set." It says the safe region and the
strongly-self-improving region **do not overlap.** The architecture can occupy either — a shallow,
safe, boundedly-self-modifying system, or (if it insists on open-ended self-modification) a safe but
inert one — but not a safe, open-endedly self-improving one. The external anchor is not a cost you
pay a little of; at the open-ended end it is a cost you pay on *everything*, which is another way of
saying open-ended safe autonomy is unavailable.

## 7. Is this itself right? (holding the new claim to the same standard)

Having twice claimed too much (termination, then convergence), the dichotomy claim must be stated at
its own true strength, no more:

- **What is established:** for a *sound* (never-false-negative) governance of self-modification, the
  fluidity of the data/code boundary lower-bounds how much must be externally anchored, and at full
  fluidity that bound is "essentially all changes." This is a soundness argument, and it holds as far
  as the soundness requirement holds.
- **What is NOT established:** that real systems must be at full fluidity. A real design might
  *deliberately fix* parts of its boundary (make certain state provably-never-behavior-determining by
  construction), buying autonomy in those parts at the cost of not self-modifying them. This is the
  one escape, and it is not "convergence" — it is **choosing to be a fixed-boundary system in the
  parts where autonomy is wanted, and accepting no self-modification there.**

So the honest final form is not "convergence" and not "hopeless," but a **design principle**:

> **Autonomy is available exactly where the system agrees not to self-modify the boundary. You get
> autonomous safe improvement only in regions you have frozen against boundary-rewriting. Every region
> left open to open-ended self-modification must be externally anchored in full. The architecture's
> real job is not to set a dial but to let the system's designers *partition* itself into frozen-and-
> autonomous vs. fluid-and-anchored regions — and to make that partition explicit, enforced, and
> itself unmodifiable-without-anchor.**

That is a genuinely different architectural mandate than any prior document stated, and it is the
actual product of attacking convergence.

## 8. What now stands, and what is deferred

**Stands (corrected, twice over):**
- Not termination (round 8 refuted it), not convergence (this document refutes it), but a
  **partition principle**: freeze regions to make them autonomous-and-safe; leave regions fluid and
  they must be fully anchored. Safety and open-ended autonomy do not overlap; the design chooses a
  partition, not a dial setting.

**Deferred:**
- **The partition mechanism** — how the system's state/machinery is divided into frozen (autonomous)
  and fluid (anchored) regions, how the partition is enforced, and how the partition itself is
  protected from self-modification (it must be anchored, or it is a bypass). This is the new narrowest
  architectural point.
- **Whether the partition principle survives attack** — the same discipline applies. Is there a
  change that is safe yet crosses the partition, or a partition that cannot be soundly enforced? If
  so, even the partition principle is too strong. It should be attacked exactly as termination and
  convergence were. → *Done in [CONSTITUTION-PARTITION.md](CONSTITUTION-PARTITION.md): the principle
  survives conditionally (boundary fixed at design time), but leaves cross-partition information flow
  as a residual, undesignable-away threat — now recorded in [THREAT_MODEL.md](THREAT_MODEL.md).*
- **The values question, now unavoidable and sharpened** — the partition *is* the safety-vs-autonomy
  decision, and it is not a smooth dial but a hard choice of which regions may never self-improve. The
  unwritten constitutional articles must make it, with eyes open to the fact that the frozen regions
  are the price of safety and there is no free autonomous self-improvement of the boundary itself.
