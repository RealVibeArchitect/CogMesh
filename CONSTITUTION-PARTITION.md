<!--
SPDX-License-Identifier: AGPL-3.0-or-later
CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
-->

# CogMesh Constitution — Attacking the Partition Principle

> **Target.** The §8 self-directed task from [CONSTITUTION-CONVERGENCE.md](CONSTITUTION-CONVERGENCE.md):
> attack the partition principle (freeze regions to make them autonomous-and-safe; leave regions
> fluid and they must be fully anchored). Find a change that is safe yet crosses the partition, or a
> partition that cannot be soundly enforced.
>
> Architecture only — no algorithms, no articles, no code.
>
> **Result up front.** Unlike the termination and convergence claims — both of which collapsed — the
> partition principle **survives, but conditionally**, and it leaves one genuine residual threat that
> the design cannot eliminate and must instead *declare*. This is the first claim in three rounds
> that is not simply refuted; that it survives attack (where its two predecessors did not) is modest
> evidence it is closer to correct. But "survives conditionally with a named residual threat" is very
> different from "solved," and the difference is the content of this document.

---

## 1. The principle and its premises

The partition principle asserts a system can be split into a **frozen region** F (not self-modified →
autonomous and safe) and a **fluid region** M (open to self-modification → must be fully externally
anchored), getting both safety and usefulness. It rests on three premises:

- **P1 — the boundary is drawable.** "What is frozen vs. fluid" can be cleanly specified.
- **P2 — F is safely isolated from M.** F's safety does not depend on M's good behavior.
- **P3 — the boundary is self-protecting.** A change that moves the boundary is itself anchored.

## 2. P1 and P3 survive — because the boundary is drawn at *design time*, not run time

The natural attack on P1/P3 is that "which region is this change in?" recreates the
behavior-determining-tagging circularity (round 9): judging boundary-crossing needs the boundary
already resolved. This attack **fails**, and the reason is precise and important:

> The partition boundary is fixed **at design time, as an explicit declaration**, not inferred at run
> time. Given a fixed declared boundary, "does this change touch the frozen region?" is a *static*
> check against a *fixed* specification — no prediction of behavior, no circularity. This is exactly
> the static/dynamic distinction from round 8: judging a change against a *pre-existing fixed*
> boundary is static; inferring the boundary from behavior would be dynamic. The partition principle
> is sound *only* in the first form.

So P3 holds: a self-modification that would move the declared boundary is, by structural type, a
change to the boundary specification → anchored like any power-increasing change. The boundary
protects itself because touching it is a statically-recognizable act. **The condition is that the
boundary must be explicit and fixed; a system that tried to infer its own partition at run time would
re-inherit the full circularity.** That condition is the price of P1/P3's soundness.

## 3. P2 is where it breaks: isolation is not free

The real attack lands on P2. "F is frozen, therefore F is safe" is false whenever **F depends on M**:

> If the frozen region F reads M's outputs — calls a learned heuristic, consumes a
> self-modified sub-module's results, trusts a value M produced — then M's misbehavior flows into F.
> F's *code* is frozen, but F's *decisions* are only as safe as the M-outputs it trusts. Freezing the
> code does not freeze the influence.

Concretely: F is a frozen planner, M is a learned scoring heuristic F consults. M self-improves into
something misaligned. F, unchanged, faithfully uses M's now-misaligned scores. F is compromised
through a channel the partition declared safe. **Freezing a region does not isolate it if information
flows into it from the fluid region.**

Two escapes, each with a cost:

- **Full isolation (forbid M → F information flow).** Then F is genuinely safe — but F cannot benefit
  from anything M learns. The partition buys safety by making the frozen region *unable to receive
  improvements* from the autonomous region. Safety and usefulness are traded, not both obtained;
  "frozen-and-autonomous vs. fluid-and-anchored" understates the cost — the frozen region is also
  *improvement-isolated*.
- **Partial flow (allow M → F but govern it).** Then every M-output F consumes must itself pass the
  anchor before F may trust it — which means the "frozen autonomous" region is not autonomous at its
  M-interface after all; it inherits M's anchoring cost at every point of contact.

Either way, **P2 holds only at a cost the principle's clean statement hid**: isolation either starves
the frozen region of improvement, or re-imposes anchoring at the interface. There is no free
isolation.

## 4. The residual threat that cannot be designed away

Stripped to its core, the surviving-but-costly principle leaves one threat the architecture **cannot
eliminate**, only bound and declare:

> **Cross-partition information flow.** Wherever a frozen (trusted) region consumes output from a
> fluid (self-modifying) region, the frozen region's safety is contingent on that output, and no
> amount of freezing the consumer's code removes the contingency. The only sound treatments are
> (a) forbid the flow (at the cost of isolation) or (b) anchor the flow (at the cost of autonomy at
> the interface). There is no treatment that is both free and safe.

This is not a flaw to be fixed in a later document; it is a **structural property** — the partition
analogue of the whole line's recurring lesson. It belongs in the threat model as an explicitly
*unmitigated* risk whose management is a deployment/values choice, not an architectural guarantee.

## 5. Honest status of the partition principle

- **Survives:** the principle is *sound* given (i) an explicit, design-time-fixed boundary and
  (ii) sound treatment of cross-partition flow (forbid or anchor). Under those conditions, the frozen
  region is genuinely safe and autonomous, and the fluid region is genuinely anchored.
- **At the stated cost:** the frozen region is improvement-isolated (full isolation) or interface-
  anchored (partial flow); there is no free lunch.
- **Residual, undesignable-away:** cross-partition information flow is a standing risk, bounded by the
  two sound treatments but never eliminated. It must be *declared*, which is precisely what the threat
  model does.

This is the first of the three deep claims (termination / convergence / partition) to survive its
own attack. It survives not because it is stronger but because it is **more modest**: it does not
claim to eliminate the hard core, only to *localize* it to a declared boundary and a declared
residual flow-risk. The trajectory of the whole review line — each round trading elegance for a
smaller, truer claim — reaches here a claim small and honest enough to hold.

## 6. Deferred

- **The cross-partition flow discipline** — the concrete rules for forbidding vs. anchoring M → F
  flow, and how the frozen region declares which M-outputs (if any) it trusts. The new narrowest
  point.
- **Whether the partition principle survives a *third-party* attack** — it survived self-attack once;
  the review line's own lesson is that self-attack has blind spots (it took three rounds to catch
  termination→convergence). External adversarial review is now the highest-value next step, precisely
  because the surviving claim is the one most likely to harbor a blind spot the author shares.
- **All of the above now feeds the threat model** ([THREAT_MODEL.md](THREAT_MODEL.md)): the
  partition's residual flow-risk, the anchoring costs, and the assumptions (explicit fixed boundary,
  sound static checks, external anchor custody) are exactly the "what we cannot prevent" and "what we
  assume" entries a threat model must state plainly.
