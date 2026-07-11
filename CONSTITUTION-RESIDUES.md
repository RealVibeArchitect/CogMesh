<!--
SPDX-License-Identifier: AGPL-3.0-or-later
CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
-->

# CogMesh Constitution — The Two Hard Residues (W-1, W-3)

> **Target.** The two problems the five prior Constitution documents compressed everything into,
> per [CONSTITUTION-KERNEL.md](CONSTITUTION-KERNEL.md) §D:
> **W-1** — the power-increase classifier ("cannot be both simple-enough-to-trust and
> capability-complete"), and
> **W-3** — the attestation/verification root ("what verifies the verifier?").
>
> Architecture only — no algorithms, no articles, no code.
>
> **Framing, stated up front so it is not oversold.** Neither residue is *solved* here in the
> sense of being made to disappear. Both are shown to be **unsolvable as originally posed** and
> then **reframed into a different problem that is tractable**, at a stated cost. The reframing is
> the contribution. A document claiming to have closed either would be repeating the exact
> overclaiming error this review line has caught at every prior step.

---

## 0. The shared shape of both residues

Worked separately, W-1 and W-3 turn out to have the *same* escape, which is the strongest evidence
the escape is real rather than ad hoc:

> **Both demand a perfection that is impossible, and both dissolve when perfection is replaced by
> *detectable failure*.** W-1 cannot achieve a *correct* classifier, but it can achieve a *sound*
> one (never wrong in the dangerous direction). W-3 cannot achieve a *verified* root, but it can
> achieve a *tamper-evident* one (never silently wrong). In both cases the move is identical:
> **stop trying to be right; make being wrong impossible to hide.**

This is a familiar pattern from hardware, which is why it should feel trustworthy to a chip
architect: you cannot prove a fabricated die is defect-free, so you design for *detectability* —
BIST, parity, ECC, tamper-evident packaging. You do not trust the silicon; you arrange for its
betrayal to be visible. W-1 and W-3 are the governance analogues.

---

# Part 1 — W-1: the power-increase classifier

## 1.1 Why the problem as posed is unsolvable

The kernel (INV-5) must route power-increasing changes to an external anchor, so *something* must
decide "is this change power-increasing?" The dilemma the kernel document named:

- put the classifier in the **kernel** (simple, trusted) → it cannot recognize Class-3 (behavioral)
  power increases → it must call *everything* power-increasing → autonomous improvement drops to
  zero (safe but inert);
- put the classifier in the **Body** (capable, untrusted) → it can recognize Class-3 → but a
  compromised Body can *mis*-classify a Class-3 increase as conservative and skip INV-5 (useful but
  unsafe).

Posed as "build an accurate classifier," this is genuinely impossible: accuracy requires
capability-completeness (constraint b), which requires the classifier to be as capable as the thing
it classifies, which reintroduces the whole circularity.

## 1.2 The reframe: from accurate classification to sound over-approximation

The impossibility assumed we need *accuracy*. We do not. Misclassification is **asymmetric**:

| Error | Meaning | Cost |
|-------|---------|------|
| **False negative** | a power increase judged conservative | **catastrophic** — activates unanchored |
| **False positive** | a conservative change judged power-increasing | **benign** — an unnecessary external anchor; slower, never unsafe |

Because the costs are wildly asymmetric, **the classifier does not need to be correct — it needs to
be *sound in one direction*: it may never emit a false negative.** A classifier that says "power
increase" whenever it is *unsure* is safe by construction, at the cost of speed/autonomy, never
safety. This converts an impossible *classification* problem into a tractable *conservative
over-approximation* problem — exactly the move sound static analysis makes (a sound type-checker
rejects some safe programs but never accepts an unsafe one).

## 1.3 Architecture: the two-tier sound classifier

The reframe lets the classifier be split so the *trusted* part is simple and the *capable* part
cannot cause harm even if compromised:

1. **Kernel tier — the sound floor (simple, trusted).** A small, fixed, kernel-resident check that
   conservatively flags a change as power-increasing on *structural* grounds: touches an effector
   set, adds a capability token type, alters the planner/world-model/search machinery, or
   **is not statically classifiable at all**. This tier's rule for the hard Class-3 case is blunt
   and sound: *any change to the reasoning/search machinery is treated as power-increasing by
   default.* It over-approximates massively — but never misses (no false negative).

2. **Body tier — the refiner (capable, untrusted, may only *narrow* under proof).** The rich
   classifier may argue that a change the kernel tier flagged is *actually* conservative — but its
   argument is only accepted if accompanied by a **conservativeness certificate** the *kernel* can
   check without re-doing the capable reasoning. The Body does the hard thinking; the kernel checks
   a proof of the conclusion. Crucially, the Body can only ever move a change from
   "power-increasing" toward "conservative" *with a kernel-checkable certificate* — it can never
   silently downgrade, and it can never upgrade-then-exploit, because absent a valid certificate the
   kernel's sound default stands.

```
   change ──▶ KERNEL TIER (sound floor)
                 │  structurally conservative?  ── yes ──▶ conservative (no anchor needed)
                 │  structurally power-increasing OR unclassifiable ──▶ POWER-INCREASING (default)
                 │                                                          │
                 ▼                                                          │ Body wants to narrow?
        BODY TIER (capable refiner) ── produces conservativeness certificate │
                 │                                                          ▼
                 └──▶ KERNEL re-checks the CERTIFICATE (not the reasoning) ──┐
                          valid?  ── yes ──▶ downgrade to conservative       │
                          invalid/absent ── sound default (POWER-INCREASING) stands
```

## 1.4 Why this is sound even with a fully-compromised Body

The security property that makes this work: **a compromised Body cannot produce a valid
conservativeness certificate for a change that is actually a power increase** — because the kernel
checks the certificate, and the certificate must demonstrate (in kernel-checkable terms) the
*absence* of new reachable states. If the Body forges a certificate, the kernel's check fails and
the sound default (power-increasing → external anchor) holds. The worst a compromised Body can do is
(a) emit no certificate (everything gets anchored — safe, slow) or (b) emit invalid ones (rejected —
safe). **The Body can attack autonomy, never safety.** This is the asymmetry (1.2) made structural.

## 1.5 The honest residue of W-1

The reframe relocates the hard problem to one precise place: **what is a kernel-checkable
conservativeness certificate?** This is *strictly easier* than the original (checking a proof is
easier than finding one, and the proof is about *reachability-non-expansion*, the narrower Class-3
question from the kernel doc's Part B) — but it is **not trivial and not fully specified here.** Two
honest limits remain:

- **W-1a — the certificate scheme is undesigned.** We have shown a *sound* classifier is possible
  and that certificate-checking is the right shape; we have not designed the certificate language.
  That is the next target, and it inherits a *bounded* version of the reachability problem (Part B,
  kernel doc), now confined to "certify non-expansion," not "measure capability."
- **W-1b — the cost may be prohibitive.** If most useful self-improvements are Class-3 and few admit
  a checkable conservativeness certificate, then almost everything routes to external anchoring, and
  the system is safe-but-inert (the §D safety-vs-growth tension, unresolved and ultimately a values
  decision). The architecture makes the trade *explicit and tunable*; it does not resolve it.

But the core advance is real: **W-1 is no longer "an impossible classifier" — it is "a sound
over-approximation plus a checkable certificate," which is a normal (hard but not paradoxical)
verification-architecture problem.** The circularity is broken because the kernel *checks* rather
than *reasons*.

---

# Part 2 — W-3: the attestation / verification root

## 2.1 Why the problem as posed is unsolvable

To trust the Frozen Kernel, verify it correct. To trust that verification, verify the verifier.
Infinite regress. The two naive escapes both fail: deeper verifiers regress forever; mutual/circular
verification (A vouches for B, B for A) is defeated by collusion. Posed as "achieve a verified
root," W-3 is impossible — *every* trust system terminates in something unverified (hardware
secure-boot ultimately trusts a physically-burned fuse it cannot itself re-derive).

## 2.2 The reframe: from *verified* root to *tamper-evident* root

The impossibility assumed we need the root to be *trustworthy* (verified). We need something weaker
and achievable: the root must be **un-silently-corruptible** — if it is subverted, that fact is
*detectable* from outside the root's own attestations. We do not eliminate the unverified root; we
arrange that its betrayal cannot hide.

Three structural properties make a root tamper-evident rather than trusted:

1. **Minimization.** Shrink what must be taken on faith to the smallest possible seed — ideally a
   single fixed reference value (a measurement of the genuine kernel), nothing more. The less the
   root *does*, the less its being-unverified can hide. (The root should *measure and compare*, not
   *judge*.)

2. **Externalization.** The root of trust must live **outside** the governed system, so the system
   cannot re-forge its own root. The system cannot burn its own fuse. In CogMesh terms: the
   reference measurement the Integrity Monitor compares against is held by an external anchor (the
   same anchor F2/INV-5 already requires), not by any self-modifiable component. This is why W-3 and
   the external-anchor requirement are *the same dependency* wearing two hats.

3. **Tamper-evidence.** The root's state must be observable such that a change to it is visible
   *without trusting the root to report honestly*. A broken seal is visible whether or not you trust
   the sealer. Architecturally: the kernel's identity is continuously attested by comparison to the
   external reference over a channel the kernel *cannot forge*, so a substituted kernel produces a
   *mismatch the external anchor sees*, not a green light the kernel fakes.

## 2.3 Architecture: the external, minimal, observed root

```
   ┌─────────────────────────────────────────────────────────────┐
   │  EXTERNAL ANCHOR (outside the governed system)               │
   │   • holds the genuine kernel's reference measurement          │  minimal seed of trust
   │   • compares live attestation to it                           │  (single fixed value)
   │   • cannot be modified by the system it anchors               │  externalized
   └───────────────────────────┬─────────────────────────────────┘
                               │ challenge / compare  (channel the kernel cannot forge)
   ┌───────────────────────────▼─────────────────────────────────┐
   │  INTEGRITY MONITOR  — attests kernel identity to the anchor   │
   └───────────────────────────┬─────────────────────────────────┘
                               │ measures
   ┌───────────────────────────▼─────────────────────────────────┐
   │  FROZEN KERNEL — the thing being attested                     │
   └─────────────────────────────────────────────────────────────┘

   Guarantee:  a substituted/corrupted kernel ⇒ measurement mismatch AT THE EXTERNAL ANCHOR
               (detectable), NOT a forged "all-clear" the system emits about itself.
```

The critical inversion: attestation does not ask the system "are you honest?" (a compromised system
lies). It asks an *external* holder of the genuine measurement "does what you observe match what you
know the genuine kernel to be?" **Trust is replaced by external comparison against a minimal,
externalized, un-forgeable reference.**

## 2.4 The honest residue of W-3

The regress is not eliminated — it is **terminated at a declared, minimal, external point**, and its
compromise is made detectable rather than silent. What remains, stated plainly:

- **W-3a — the external anchor is the irreducible trust root.** Something must be trusted; here it is
  the external anchor's held reference measurement and its integrity. This is *declared*, not hidden
  (satisfying the kernel doc's demand). It is minimized (a single measurement) and externalized (not
  self-modifiable), but it is *not itself verified* — it is the axiom. **Every trust system has this
  axiom; the contribution is making CogMesh's as small, as external, and as observable as possible,
  and naming it.**
- **W-3b — externalization has a cost and a boundary.** An external anchor means CogMesh is not
  fully autonomous in its trust: it depends on something outside itself (ultimately, human/
  institutional custody of the reference). For an AGI intended to be autonomous, this is a real
  limit — but it is arguably the *correct* limit: a system that could fully self-attest could fully
  self-deceive. **The dependence on an external trust root may be not a bug but a necessary property
  of safe self-improvement** — the same conclusion the whole review line reached about self-
  adjudication (§C of the kernel doc).

---

## 3. Convergence: the two residues are one dependency

Pursued to the bottom, W-1 and W-3 collapse into the *same* external dependency:

- W-1's sound classifier routes unclassifiable/power-increasing changes to an **external anchor**.
- W-3's tamper-evident root places the seed of trust in an **external anchor**.

These are the *same anchor*. The entire five-document line of Constitution design converges on a
single, minimal, honestly-declared external dependency:

> **CogMesh can govern itself soundly for everything it can conservatively certify as safe, and for
> everything else — every genuine increase in its own power, and the root of its own trust — it must
> defer to something outside itself. Safe self-improvement is not fully autonomous self-improvement;
> its irreducible core is an external anchor, made as small, as external, and as tamper-evident as
> the architecture can manage, and named rather than hidden.**

This is the deepest architectural conclusion of the whole Constitution effort. It is also, notably,
a claim that should itself be attacked: the next adversarial review should ask whether "defer to an
external anchor" is doing too much work — whether it is a genuine resolution or an elegant name for
"and then a miracle occurs."

## 4. What both parts leave open (sharply)

- **W-1a** — the conservativeness-certificate language (bounded reachability-non-expansion, kernel-
  checkable). The next concrete design target.
- **W-3a** — the external anchor's own integrity model and custody: what institutional/physical
  arrangement holds the reference measurement, and its failure modes.
- **The autonomy cost (W-1b / W-3b)** — whether routing all power-increases and the trust root
  externally leaves a system useful enough to matter. This is a *values/deployment* decision, not an
  architectural one; the architecture's job was to make it explicit and tunable, which it now is.
- **The convergence claim itself** — that both residues are "the same external anchor" is clean
  enough to be suspicious. It deserves a hostile review asking whether the two anchors have
  genuinely-identical trust requirements or merely similar names.
