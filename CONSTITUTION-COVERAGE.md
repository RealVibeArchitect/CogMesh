<!--
SPDX-License-Identifier: AGPL-3.0-or-later
CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
-->

# CogMesh Constitution — The Coverage Check & the Floor of the Recursion (W-1a-ii)

> **Target.** W-1a-ii from [CONSTITUTION-CERTIFICATES.md](CONSTITUTION-CERTIFICATES.md) §B5: the
> coverage check — how the kernel rigorously confirms a conservativeness-derivation accounts for
> the *entire* change with nothing hidden. This was named "the narrowest point the whole
> circularity has been compressed to."
>
> Architecture only — no algorithms, no articles, no code.
>
> **Two questions, not one.** This document does not only *design* the coverage check (§2). It also
> asks whether the check hides yet another turn of the circularity — and, more importantly, whether
> the whole seven-document recursion *terminates here or continues forever* (§3). The second
> question matters more than the first: a design that quietly generates a new hard point at every
> level is not progress, it is an infinite regress wearing the costume of progress. The central
> claim of this document is that **the recursion has a floor, and this is it** — with the reason
> stated precisely enough to be attacked.

---

## 1. The coverage check, and the trap inside it

### 1.1 What coverage must guarantee

A certificate is a derivation: old system → [transform₁] → [transform₂] → … → new system, each
transform drawn from the approved reachability-preserving catalog. Soundness needs the derivation to
explain the *whole* change — if any part of the modification is **not** produced by a catalogued
transform, an expansion could hide in that unexplained part. Coverage is the check that nothing is
unexplained.

### 1.2 The naive check, and why it is not enough

The naive coverage check is *syntactic*: compute the diff each transform produces, union them, and
confirm the union equals the actual old→new diff. This is a pure structural comparison the kernel
can do without capability. And composition is safe on its face — the composition of non-expanding
maps is non-expanding (a mathematical fact, not a judgment).

But there is a trap, and it is the real content of W-1a-ii:

> **The code diff can be fully explained while the change's *effect* lives outside the code.** A
> catalogued transform ("memoize this function") is locally conservative, but if the memoized
> function's behavior depends on external state — a config value, a data file, a learned weight, a
> resource the code merely *references* — then the syntactic code-diff is completely covered while
> the modification's true reach extends beyond it. Coverage over *code* misses expansion routed
> through *what the code touches*.

The trap is not in the transforms; it is in the **boundary of "the change."** A change is not just
edited lines; it is the edited lines *plus everything their effect can flow through*.

### 1.3 The fix: coverage over the *effect closure*, soundly over-approximated

The coverage check must be over the **effect closure** of the change — the set of all state the
changed code can read or write, transitively — not merely the code diff. And, following the pattern
that has recurred at every level of this design, the closure is not computed exactly (intractable);
it is **soundly over-approximated**: when in doubt whether something is in the closure, include it.
Over-inclusion is safe (it can only cause an unnecessary "power-increasing" verdict → external
anchor); under-inclusion is the only dangerous error, and the over-approximation never commits it.

So the kernel's coverage check becomes: *do the certificate's transforms account for the entire
effect closure of the change, over-approximated?* — where the effect closure is derived from the
system's **static dependency graph** (what references what). That graph is extractable syntactically,
without running anything.

```
   change  ──▶  effect closure (over-approximated from the static dependency graph)
                     │   "everything this change can read/write, transitively;
                     │    when unsure, include it"  (sound: never under-includes)
                     ▼
   KERNEL coverage check:
     do the certificate's catalogued transforms account for the ENTIRE effect closure?
        │
        ├─ yes ──▶ coverage holds → (with steps 1–2) CONSERVATIVE
        └─ no  ──▶ sound default → POWER-INCREASING → external authority
```

---

## 2. Does the effect closure hide another circularity?

The recurring danger: each fix has escaped a circularity only by relocating it. Does "compute the
effect closure" secretly require the capability we were trying to gate?

**No — and the reason is the crux of the whole document.** The distinction is between two questions
that look similar and are categorically different:

| Question | Type | Answerable without running the system? |
|----------|------|----------------------------------------|
| "What will this change **do**?" | dynamic / behavioral | **No** — requires executing the (improved) capability → circular |
| "What can this change **touch**?" | static / structural | **Yes** — read off the reference graph → not circular |

Every prior hard point (measure capability, classify power, certify non-expansion behaviorally) was
a **dynamic** question: it asked what the improved system *would do*, which you can only know by
*being* that system — the source of the circularity. The effect closure asks only what the change
*can reach*, which is a **static** property of the reference structure, readable without execution.

> **The circularity was never about complexity; it was about *tense*.** Dynamic questions ("what
> will it do?") are circular because answering them requires the future capability. Static questions
> ("what can it touch?") are not, because the reference structure exists now and can be read now. The
> effect closure is deliberately posed as a static, present-tense question, and that is exactly why
> it does not inherit the circularity.

This is why over-approximating the closure is sound *and* non-circular: over-inclusion is a static
decision ("include it if the graph can't rule it out"), requiring no judgment about future behavior.

---

## 3. Why this is the floor — the recursion terminates here

The strongest claim in this document, stated so it can be attacked: **the seven-document recursion
bottoms out at the effect-closure coverage check, and does not continue.**

### 3.1 The pattern, and the question it forces

Every level escaped its circularity by the same move — replace an exact requirement with a sound
over-approximation:

- capability *measurement* → power *classification* (over-approximate: unsure ⇒ power-increasing)
- power classification → non-expansion *certification* (over-approximate: uncatalogued ⇒ rejected)
- non-expansion → effect-closure *coverage* (over-approximate: unsure ⇒ in the closure)

An honest reviewer must ask: does this go on forever? Does the effect-closure check generate a
*new* hard point, making this the seventh turn of an infinite screw rather than the last?

### 3.2 The termination argument

It terminates, because **the effect-closure check is the first hard point in the chain that is a
purely static question** (§2), and static questions do not spawn dynamic sub-questions.

Trace the dependency of each level's *check* on the level below it:

- Checking "is this power-increasing?" needed "does it expand reachable states?" — **dynamic**, so it
  needed a deeper check.
- Checking "does it expand reachable states?" needed "is it built from non-expanding transforms?" —
  still reduces to behavior, **dynamic**, deeper check needed.
- Checking "is it built from non-expanding transforms?" needed "does the derivation cover the whole
  change?" — and *this* reduces to "what can the change touch?", which is **static**.

A static question is answered by reading the present reference structure. Reading a static structure
requires no further judgment about behavior, so it **generates no new dynamic sub-question** — the
chain of "and to check that, you must first check…" halts. There is nothing below "read the reference
graph" that is itself circular, because reading a graph is not a capability-laden act.

> **The recursion was a descent from dynamic to static. It terminates at the moment the question
> becomes static, because only dynamic questions were ever circular. The effect-closure coverage
> check is that moment.**

> **⚠ Correction (added later).** This termination claim was subsequently **attacked and found
> wrong** in [CONSTITUTION-TERMINATION.md](CONSTITUTION-TERMINATION.md). The effect closure captures
> a change's *reach* but not its *behavior-within-reach*, so a learned-weight update (reach-fixed,
> behavior-changed) is mis-certified as conservative — a false negative. The corrected claim is that
> the recursion does **not terminate at a static floor** but **converges**, with the external anchor
> catching the never-quite-zero residue. Read this section as superseded by that document.

### 3.3 What "floor" does and does not mean

Precisely, to avoid overclaiming (the error caught last round):

- **It does mean:** no *further circularity* lies below this point. The infinite-regress worry is
  answered — the chain of self-referential hard points ends here.
- **It does not mean:** the coverage check is *easy* or *fully specified*. Building a sound static
  effect-closure extractor for a real system is substantial engineering. But engineering difficulty
  is not circularity; a hard-but-static problem is *normal*, not paradoxical. The floor is a floor of
  *circularity*, not of *effort*.
- **It does not mean:** zero residue. The over-approximation's tightness is the familiar
  safety-vs-autonomy dial (§4). But that is a *values* setting, not a new hard point — it was already
  identified, and it recurs here in the same form rather than as something new.

---

## 4. The honest residue of W-1a-ii — and it is not a new problem

Two limits remain, and the important fact is that **neither is a new circularity**; both are
instances of tensions already named:

- **W-1a-ii-α — closure tightness is the safety-vs-autonomy dial, again.** A loose (very
  over-approximate) closure marks almost everything as "touching too much" → almost everything
  escalates to the external authority → safe but inert. A tight closure certifies more changes
  autonomously but demands a more precise static analysis. This is the *same* dial as W-1a-i / W-1b,
  now at the closure level. It is a values/deployment setting the architecture exposes, not a hard
  point it must solve.
- **W-1a-ii-β — the static analysis must itself be trusted.** The effect-closure extractor is code;
  it lives in (or is checked by) the kernel, so it inherits W-3's trust-root question — *is the
  extractor the genuine one?* But this is **not new**: it is W-3, already designed (tamper-evident,
  minimal, externally-anchored). The coverage check does not add a trust root; it *uses* the one W-3
  already established. That the residue folds back into an already-designed dependency, rather than
  opening a new one, is itself evidence the design has closed.

---

## 5. Where the whole effort now stands

With W-1a-ii resolved, the seven-document line of Constitution design reaches a definable end-state.
The irreducible core — everything that must be trusted or externally supplied — has been compressed
to a small, fixed, non-recursive set:

> **Everything the system does reduces to mechanical kernel checks (token validity, staging
> provenance, trajectory-chain integrity, certificate-derivation coverage over a static effect
> closure), except two things it must obtain from outside itself: a minimal passive *trust reference*
> (W-3 — is the kernel genuine?) and an active *power authority* (W-1 — curate the transformation
> catalog). Both external dependencies are minimal, declared, and non-recursive. The chain of
> self-referential hard points terminates at the effect-closure coverage check, because that check
> is the first question in the chain that is static rather than dynamic, and only dynamic questions
> were ever circular.**

The trajectory of the entire effort, in one line:

> **measure capability → classify power → certify non-expansion → check derivation coverage → read
> the static effect closure** — a descent from an impossible dynamic question to a hard-but-bounded
> static one, terminating exactly where the question stops being about the future.

This is an *architectural* end-state, not a solved problem in the strong sense: real engineering
(the static analyzer, the catalog, the trust anchor's custody) and one genuine *values* decision
(the safety-vs-autonomy dial) remain. But there is no longer a hidden circularity waiting one level
down. That — and only that — is what this document claims to have shown.

## 6. Deferred (no longer circular — engineering and values only)

- **The static effect-closure analyzer** — sound, over-approximating, kernel-checkable. Hard
  engineering; not circular.
- **The safety-vs-autonomy dial** (W-1a-ii-α, and its siblings) — a single explicit setting the
  unwritten constitutional articles must choose. A values decision.
- **Catalog custody and the trust-reference's interaction with catalog versions** — the two external
  dependencies are separate but must stay consistent (carried from the certificates doc).
- **The termination argument itself deserves a hostile review.** The claim "only dynamic questions
  were circular, and this one is static, so the recursion ends" is clean enough to be suspicious. The
  right next step is not to build on it but to attack it: is there a hard point in the design that is
  *static yet still circular*, or *dynamic yet unnoticed*? If none is found under determined attack,
  the architecture is closed; if one is found, it becomes the new floor and the descent continues.
