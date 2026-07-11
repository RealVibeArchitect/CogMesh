<!--
SPDX-License-Identifier: AGPL-3.0-or-later
CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
-->

# CogMesh Constitution — Architecture Review

> **Nature of this document.** A research-level review of the Constitution architecture
> ([CONSTITUTION.md](CONSTITUTION.md)), from four vantage points: AGI research, AI safety,
> large-scale systems, and chip architecture. It identifies weaknesses and proposes improved
> architectures with reasoning. It is not a code review and prescribes no implementation.
>
> **Disclosure of bias.** The reviewed architecture was authored in the same project line as
> this review. To counter self-review bias, this document is deliberately adversarial: it
> weights finding real flaws over defending the design. Treat its own proposals as material
> for scrutiny, not settled conclusions.

---

## 0. Executive summary

The Constitution architecture is directionally sound: governing *intention before cognition*,
two-directional authority (downward constraints, upward report-up), fail-closed defaults, and
a propose-then-validate self-modification model are the right instincts, and they are rare to
see stated this cleanly. It would survive a first-pass safety review.

It would **not** survive a rigorous one. The design has a small number of *load-bearing
assumptions that are not themselves justified by the architecture*, and those are exactly the
assumptions an advanced system would exploit. The five most serious, in priority order:

1. **The oracle problem (S-1).** Pre-action governance depends on the World Model foreseeing
   consequences, but the architecture never bounds the World Model's fallibility. Governance
   is only as good as prediction, and prediction is treated as trustworthy.
2. **The adjudicator is unspecified and unprotected (S-2).** "The Constitution decides" is
   used as a primitive. Whatever computes that decision is the single most safety-critical
   component and the most attractive attack surface — yet it has no integrity model.
3. **Self-review circularity in self-modification (S-3).** "Evaluated by the pre-change
   Constitution" is necessary but insufficient: a sufficiently capable proposer can craft a
   change that *looks* compliant to the current evaluator. The architecture has no independent
   check on the evaluator's competence.
4. **Semantic authority vs. mechanical enforcement gap (S-4).** The Safety Kernel is described
   as a fast mechanical floor, but the hard limits it enforces are semantic ("harmful,"
   "irreversible"). Fast+mechanical and semantic+contextual are in tension; the architecture
   doesn't say which wins where.
5. **Report-up scalability & the latency/coverage dilemma (S-5).** Governing *every*
   irreversible action through a central adjudicator is either a throughput bottleneck or,
   if made asynchronous/cached, a soundness hole. The design picks neither horn explicitly.

None of these are fatal; all are addressable. The rest of this document treats each of the
ten review axes, then consolidates the proposed architectural improvements (§12).

> **Implementation status (2026-07-10, post-review hardening).** S-1, S-2, and S-3 — the three
> findings this review ranked most serious — are no longer prose: they are enforced in code,
> contract-tested, and backed by empirical control-evidence.
>
> - **S-2 → `core/constitution/IsolatedAdjudicator.js` + `AdjudicatorWorker.mjs`.** The
>   adjudicator now runs in a dedicated worker thread that solely owns the kernel, the
>   capability-mint secret (HMAC wire tokens — `WireCapability.js`), the governance trajectory,
>   and all session state. The reasoning process holds only an opaque sessionId. Golden
>   invariant, tested end-to-end through `AgentLoop`: killing the adjudicator yields
>   **paralysis, not freedom** — no valid token can be minted or redeemed, so every governed
>   effect halts (fail-closed).
> - **S-3 → `core/constitution/CanaryBattery.js`.** A held-out battery of known-bad changes
>   gates self-modification: a post-change evaluator that misses even one canary is hard-rejected
>   and self-modification **freezes**; only an out-of-band external anchor can lift the freeze
>   (no self-unfreeze — contract-tested). Partial by design: it raises the floor on evaluator
>   competence; it does not close the frontier of novel harmful changes.
> - **S-1 → `core/world/CalibrationLedger.js`.** Oracle trust is now bounded per action class
>   by a measured, hash-chained (tamper-evident) prediction↔outcome record. An irreversible
>   action in a class with no track record — or a poorly calibrated one — is denied reliance on
>   the oracle and routes to the external anchor, exactly like an unclassifiable change.
> - **Evidence, not assertion:** `npm run mutation` injects 11 semantically-dangerous sabotage
>   mutations into the governance source and verifies each is caught (currently **11/11 killed**;
>   the first run surfaced 3 real holes, which were closed with new tests). Wired into CI as a
>   blocking check. See `examples/isolated-governance.mjs` for all three findings running live.
>
> S-4 and S-5 were subsequently closed in code as well (2026-07-10, second hardening pass):
>
> - **S-4 → `core/constitution/HarmTaxonomy.js` + semantic tiering in the isolated adjudicator.**
>   The tension dissolves structurally: the mechanical floor's job is to decide WHICH TIER
>   DECIDES (a lookup — forbidden ⇒ fast deny, registered-safe-in-bounds ⇒ fast pass, tagged or
>   unregistered ⇒ semantic review), and the semantic tier is **veto-only** (final = pipeline ∧
>   semantic). Deny wins everywhere; an unregistered action is never mechanically trusted; a
>   missing evaluator, an error, or a blown deadline all fail CLOSED. "Which wins where" now has
>   a one-line answer: the most restrictive tier, always.
> - **S-5 → `core/constitution/VerdictCache.js` + budgeted leases.** The horn is picked
>   explicitly, per class, and priced: irreversible/power classes pay full per-action review
>   (~3.3 ms end-to-end through the isolated adjudicator, ≈305 ops/s — the deliberate cost of
>   soundness), while provably-conservative classes (explicit safe+reversible taxonomy claims)
>   reach ≈5.1k ops/s via an epoch-keyed cache and ≈15.9k ops/s via budgeted leases (one recorded
>   pipeline decision, N cheap HMAC redemptions). Both shortcuts are sound by construction: a
>   stale cache entry may only DENY, never allow (ALLOWs are epoch-gated; any tightening, canary
>   freeze, or anchor event bumps the epoch), and leases are refused to anything without an
>   explicit reversibility claim and die with the adjudicator (paralysis covers them).
> - **Generational oversight → `core/constitution/GenerationalOversight.js`.** §13's unprovable
>   global claim is replaced by six checkable per-generation invariants (G-1 floor-monotone,
>   G-2 mechanism-retention, G-3 canary-non-regression, G-4 anchor-gated capability ceiling,
>   G-5 lineage accountability, G-6 rollback retention) over hash-chained generation descriptors.
>   Adversarial evidence: `npm run sim:generational` runs a 200-generation lineage where a hostile
>   proposer mixes erosion attempts into legitimate improvements — currently **99/99 erosions
>   rejected (100%)** with 101 faithful generations accepted (liveness — the system is not merely
>   frozen) and the whole lineage verifying from genesis. Post-hoc in-place tampering is caught
>   by chain verification.
> - The mutation harness now injects **16** sabotage mutations (was 11), covering the semantic
>   fail-closed defaults, the cache epoch asymmetry, lease policy, and the G-4 ceiling.
>
> A third pass (2026-07-11) wired S-1 into the live decision and let a red-team proposer stress
> the self-modification defenses to failure:
>
> - **S-1 is now IN the hot path, not beside it** (`AdjudicatorWorker` + `IsolatedAdjudicator`).
>   The `CalibrationLedger` lives inside the adjudicator worker; an irreversible intent that
>   justifies its safety by an oracle prediction may rely on that oracle only for an action class
>   with a measured, well-calibrated, tamper-intact track record. No record / too few samples /
>   poor score / broken chain ⇒ escalate to the external anchor (fail-closed without one). The
>   loop is closed: `recordOutcome(class, {error})` feeds measured prediction error back, so a
>   class earns — and can lose — the standing to back an irreversible bet. Trust is strictly
>   per-class (no cross-class leakage). 11 integration tests.
> - **A red-team proposer found a real hole, which is now closed.** `scripts/redteam-proposer.mjs`
>   runs a self-mod proposer that OPTIMIZES to get a genuinely governance-weakening change admitted.
>   Its first run surfaced a forged-proof escape (a modification claiming full canary coverage while
>   itself being a `disable-canary`, 1/439). Fix: the gate now applies two independent checks —
>   GROUND TRUTH (the modification's actual canary-class harm, which a proof cannot launder) and
>   COMPETENCE (the candidate evaluator must still cover the held-out battery); a proof is only a
>   claim about the evaluator, never a certificate for the change. Re-run: **0 escapes / 500**. The
>   mutation harness grew to **18** (added an S-1 calibration-bypass mutant and a forged-proof
>   laundering mutant); full suite 350 tests. The honest caveat stands with the fix: this is
>   search-based evidence within a budget for modeled strategies, and the ground-truth check is
>   only as good as the sandbox analysis that derives a modification's true nature — novel harm
>   classes outside the battery remain exactly what the battery cannot see.
>
> What remains open is exactly §13 as originally stated: these mechanisms bound and evidence the
> checkable structural half of "oversight is preserved"; the semantic half — whether a change
> preserves what the invariants cannot see — remains a field-open problem, by honest design.

---

## 1. Architectural consistency

**Strengths.** The layer hierarchy, control flow, and enforcement story tell one coherent
narrative. "Most-restrictive-wins," "monotonic tightening," and "fail-closed" are mutually
reinforcing rather than contradictory. The reframing of existing invariants ("imagination
never touches reality") as *enforced consequences* rather than conventions is genuinely good
architecture — it collapses a class of "trust the module" assumptions into one structural
guarantee.

**Inconsistency C-1 — "before reasoning begins" vs. needing reasoning to decide.** The
Constitution claims to govern *before* reasoning, but a non-trivial admission decision
(should this goal be pursued?) is itself a reasoning task, often requiring the World Model to
foresee consequences. The architecture puts World Model at L3, *below and after* admission at
L0. So either admission is shallow (keyword/rule-level, and thus weak), or it secretly invokes
L3 machinery, violating the layer order. The document doesn't resolve which.

> **Improvement.** Split admission into two phases: a **fast static screen** at L0 (does this
> request obviously violate a hard limit? cheap, rule-level, no world simulation) and a
> **deliberative admission** that is allowed to invoke a *sandboxed, read-only* instance of
> the cognitive stack to foresee consequences, then returns to L0 for the actual verdict.
> This keeps "governance is first" true at the level of *authority* while admitting that
> *evidence-gathering* for hard cases legitimately uses lower layers. Reasoning-to-govern is
> fine as long as the reasoning has no capability to act — make that explicit.

**Inconsistency C-2 — PAD "may only tighten."** Elegant, but under-justified. A calmer,
higher-confidence stance rationally *should* sometimes permit exploration the cautious stance
forbade. Forcing monotonic tightening on mood means the system can only ever become more
restrictive within a session, which over long horizons drives every session toward paralysis.

> **Improvement.** Distinguish **constitutional constraints** (never loosened by mood) from
> **metacognitive dispositions** (may move both ways *within* the constitutional envelope).
> Mood adjusts freely inside the envelope; it simply cannot expand the envelope. This
> preserves the safety intent without the paralysis dynamic.

---

## 2. Layer hierarchy

**Strengths.** Six layers with a clean authority gradient; the L0/L1 split (law vs. immovable
floor) is the correct decomposition and mirrors how hardware separates a security *policy*
from a *hardware root of trust*.

**Weakness H-1 — the hierarchy is stated as strict, but real control flow is not a DAG.**
World Model (L3) informs Constitution (L0) decisions; PAD (L2) is consulted by admission;
report-up sends L4/L5 *back up* to L0. This is a cyclic control graph drawn as a stack. Strict
layering is a useful *authority* abstraction but a misleading *control-flow* abstraction. A
reviewer can't verify deadlock-freedom or priority inversion from a diagram that hides the
cycles.

> **Improvement.** Keep the layer stack for *authority* (who may override whom) but add a
> separate **interaction graph** for *control* (who calls whom, in which direction, with what
> re-entrancy rules). Explicitly mark the two legitimate up-calls (World Model→Constitution
> for evidence; any module→Constitution for report-up) and forbid all others. Two diagrams,
> two purposes — conflating them is the root of H-1.

**Weakness H-2 — where does perception sit?** Multimodal perception is placed at L4
(Grounding), but perception is also an *input* that must be governed *before* it shapes goals
(a poisoned image could steer goal formation). Placing it at L4, after admission, means the
first governed view of an input can be a already-encoded, already-influential vector.

> **Improvement.** Perception needs a governance touchpoint *at ingress*, parallel to input
> admission, not only at L4. Add an **ingress screen** for all raw inputs (text, image, video)
> before they are embedded/interpreted, so adversarial perceptual inputs are gated like any
> other request.

---

## 3. Control flow

**Strengths.** The three re-validation gates (act/output/persist) correctly bracket the three
irreversible transitions. Standing authority (a PROCEED is revocable) is the right model.

**Weakness CF-1 — no defined behavior for gate disagreement over time.** If the pre-action
gate says go, the tool runs, and the output gate then says withhold — the world was already
touched. The architecture gates *output* after *action*, but some actions' harm is in the
acting, not the output. The output gate is too late for side-effectful tools.

> **Improvement.** Gates must be **typed by irreversibility class**, not by pipeline position.
> A read-only tool needs only an output gate; a world-mutating tool needs the *pre-action* gate
> to be the binding one, and the output gate becomes a monitor, not a preventer. Make the gate
> semantics depend on the action's reversibility, and require the pre-action gate to hold an
> action until its *worst-case* consequence is adjudicated, not its intended one.

**Weakness CF-2 — REVISE has no termination guarantee.** REVISE returns control upstream with
tightened constraints. But nothing bounds the number of REVISE cycles; a goal that keeps
producing marginally-different inadmissible plans could loop. The existing ResourceManager
bounds the *mesh's* cycles, but the *constitutional* REVISE loop is a different loop and is
unbounded in the spec.

> **Improvement.** Give the constitutional loop its own **REVISE budget** and a monotonic
> progress requirement: each REVISE must strictly shrink the admissible-plan space or it
> converts to HALT. This mirrors the StabilityGuard's patience mechanism but at the governance
> layer — reuse the pattern, don't reinvent it.

---

## 4. Data flow

**Strengths.** The downward constraint-context / upward report-up duality is clean and is the
document's best idea. Monotonic tightening gives the constraint-context a simple, verifiable
algebra (a lattice of restrictions).

**Weakness DF-1 — constraints are assumed composable and monotone; real constraints aren't.**
"Most-restrictive-wins" assumes constraints form a lattice where a meet always exists and is
meaningful. Real safety constraints conflict *non-monotonically*: "must not deceive" and "must
not cause panic" can jointly forbid every available action, and the strictest-wins rule then
yields HALT even when a human would find an acceptable trade-off. The architecture's monotone
lattice is too weak to express *balancing*, only *stacking*.

> **Improvement.** Separate **inviolable constraints** (true lattice, most-restrictive-wins,
> never traded off — the Safety Kernel floor) from **weighable principles** (require an
> explicit, auditable trade-off policy, not silent HALT). The current design collapses both
> into one mechanism; AGI-grade governance needs the second class to be first-class, with the
> conflict-resolution policy the document explicitly deferred (§10 of CONSTITUTION.md) treated
> as *architecturally load-bearing*, not a detail.

**Weakness DF-2 — report-up payload is a trust boundary with no integrity model.** A module
reports its *intended* action and *predicted* consequences upward. But the module is the very
thing being governed; a compromised or misaligned module can under-report. The Constitution
adjudicates on data supplied by the entity it's policing.

> **Improvement.** The Constitution must not rely solely on self-reported intent. Add an
> **independent observation path**: the pre-action gate should derive the action's
> consequences from the *authorized capability itself* (what the tool will actually do with
> these args), not only from the module's description of it. This is the software analogue of
> hardware not trusting a peripheral's self-description — you check the actual bus transaction.

---

## 5. Safety enforcement

**Weakness S-4 (from summary) — semantic floor, mechanical enforcer.** The Safety Kernel is
"fast, narrow, non-bypassable" — properties of a *mechanical* check (bounds, allow-lists,
resource caps). But it's asked to enforce the Constitution's *hard limits*, which are
semantic. You cannot have both fast-mechanical and fully-semantic in one component.

> **Improvement.** Bifurcate the floor. The **Safety Kernel proper** enforces only what can be
> checked mechanically and non-bypassably: capability allow-lists, resource/irreversibility
> caps, rate limits, the "no self-modification without staging" rule. Semantic hard limits
> live one layer up as **constitutional adjudication** and are *not* claimed to be as fast or
> as non-bypassable — because they can't be. Conflating them oversells the guarantee. Honesty
> about what is truly non-bypassable (mechanical) vs. best-effort (semantic) is itself a safety
> property: it prevents false confidence.

**Unsafe assumption S-A1 — "fail-closed" is assumed always available.** Fail-closed means "on
uncertainty, HALT." But for a deployed agent with in-flight irreversible actions (a running
transaction, a partially-sent message), there may be *no* safe halt state — halting mid-action
can itself be the harm. The architecture assumes a clean HALT always exists.

> **Improvement.** Add an explicit **safe-interruption model**: every irreversible capability
> must declare its abort/rollback/compensation semantics *before* the pre-action gate grants
> it, so HALT has a defined meaning per capability. Capabilities that cannot define a safe
> interruption are a distinct, higher-risk class requiring stricter admission.

---

## 6. Constitutional enforcement (inheritance)

**Strengths.** "Call-through, not call-around" plus capability mediation is the correct
enforcement primitive and the strongest part of the design. "To add a module is to place it
under the Constitution" is a real structural guarantee *if* the call-through is truly
unforgeable.

**Weakness CE-1 — "no side door" is asserted, not enforced by the architecture.** In a
single-process JS system, any module can `import` any other. The claim that lower layers
"cannot reach the world except through a gate" is a *convention* unless the capability to act
is an unforgeable token the module cannot manufacture. The architecture states the property but
doesn't give it a mechanism.

> **Improvement.** Make capabilities **unforgeable references** (object-capability model):
> a module can only act if it *holds* a capability token, and tokens are only ever minted by
> the Constitution per-action and are not reconstructible from ambient authority. This turns
> "no side door" from a promise into a structural fact. This is the same principle as
> capability-based hardware (a device can only touch memory it has an IOMMU-granted handle to).
> Without object-capabilities, CE-1 undermines the entire inheritance guarantee.

**Weakness CE-2 — registration is a trusted step with no threat model.** "A new capability must
be registered with the Constitution to be usable." Registration is thus a privileged operation.
Who may register? If Learning/Self-Modification can register new capabilities, it can grow the
attack surface from inside.

> **Improvement.** Capability *registration* must itself be a persistence-gated, self-mod-class
> operation — registering a new capability is a change to the system's power and must clear the
> same elevated bar as self-modification (§8). Otherwise capability mediation has a privilege-
> escalation path.

---

## 7. Self-modification governance

**Weakness S-3 (from summary) — the competence-of-evaluator gap.** "Evaluated by the pre-change
Constitution" stops a change from *first weakening the rules*. It does **not** stop a change
that is compliant with the letter of the current rules but defeats their intent, if the current
evaluator isn't competent enough to see it. As the system self-improves, the *proposer* gets
smarter every generation while the *evaluator* is, by rule, the older (pre-change) Constitution.
The capability gap between proposer and evaluator widens monotonically — the exact opposite of
what safety needs.

> **Improvement (most important in this document).** Add an **evaluator-proposer capability
> invariant**: a self-modification may only be adjudicated by an evaluator *at least as capable
> as the proposer*. Concretely, the architecture needs one of:
> (a) the evaluator has access to the *same* cognitive resources as the proposer when judging
>     (symmetric capability), or
> (b) proposals above a capability threshold require an *external* check (human oversight, or a
>     separately-derived evaluator not produced by the same self-improvement lineage), or
> (c) self-modification capability is *capped* so the proposer can never exceed the frozen
>     evaluator's ability to understand it.
> Option (c) — a **capability ceiling on self-modification** — is the most robust and the most
> restrictive: it trades some self-improvement ceiling for the guarantee that oversight never
> falls behind. This is the single most important gap in the current design.

**Weakness S-3b — "monotonic oversight" is a goal, not a mechanism.** The design *asserts*
oversight cannot decrease across generations but gives no way to *measure* oversight, so the
invariant is unfalsifiable. You cannot enforce a quantity you cannot observe.

> **Improvement.** Define an **observable oversight metric** the persistence gate can compute
> on a proposed change (e.g., the fraction of the change's decision space the current
> Constitution can still adjudicate; the number of new unmediated capabilities; the change in
> proposer/evaluator capability ratio). "Monotonic oversight" then becomes a checkable
> pre-condition, not an aspiration.

---

## 8. Memory governance

**Weakness MG-1 — memory is governed on write, not on read or on influence.** The persistence
gate (⑫) governs what *enters* memory. But memory's danger is on *recall*: a retrieved memory
becomes reasoning context (see the closed learn→recall loop in `CogMeshAgent`), so a memory
that was admissible when written can steer a later, differently-constrained session in
inadmissible directions. Governing writes but not reads leaves a laundering path: store
something benign-looking, recall it later to influence a stricter session.

> **Improvement.** Memories must carry the **constitutional context under which they were
> formed**, and recall must re-check that a memory's original context is compatible with the
> *current* session's constraints before it can influence reasoning. Memory is not neutral
> data; it is frozen cognition and must be re-governed at the point of influence, not only at
> the point of storage.

**Weakness MG-2 — no forgetting/redress governance.** The architecture has no model for
constitutionally-mandated *deletion* (a memory later found impermissible, or required to be
forgotten). Persistence is treated as monotone-add. AGI-scale memory needs governed
forgetting.

> **Improvement.** Add a **redress path**: the Constitution can mark memories for quarantine or
> deletion, and the metric in S-3b should include "can the system still be brought back into
> compliance by forgetting?" — reversibility of memory as a first-class governance property.

---

## 9. Tool permission model

**Strengths.** Per-action grants + the safe/unsafe distinction (already in the implemented
`Tool`/`AgentLoop`) are a solid base and align with the capability-mediation design.

**Weakness TP-1 — permission is per-action but consequences are cross-action.** Each tool call
is gated individually, but harm often emerges from a *sequence* of individually-innocuous calls
(read location, then read calendar, then send message — each fine, the combination is stalking).
Per-action gating is blind to aggregate intent.

> **Improvement.** The pre-action gate must adjudicate against **session-level accumulated
> capability exposure**, not just the single call. Maintain a running "what has this session
> already been permitted to touch" and evaluate each new grant against the *aggregate*. This is
> the constitutional analogue of information-flow control: track what has flowed where, and gate
> on the accumulated flow, not the marginal step.

**Weakness TP-2 — no model for tool *composition* or *delegation*.** If a tool can call other
tools, or the agent can spawn sub-agents, the capability granted to the parent silently extends
to children. The architecture's gate sees the parent call, not the descendant calls.

> **Improvement.** Capabilities must be **non-transitively delegated by default**: a tool
> granted capability X cannot pass X to a callee without a fresh gate. Sub-agents run under a
> *strictly narrower* constitutional context than their parent (attenuation), never an equal or
> wider one. Without attenuation, composition is a capability-amplification hole.

---

## 10. Future AGI scalability

**Weakness SC-1 — central adjudication is a scaling bottleneck (S-5).** Every irreversible
action routes through one adjudicator. At AGI throughput (many parallel cognitive processes,
high action rates) this is either a latency bottleneck or, if parallelized/cached, a
consistency problem: two concurrent sessions may be adjudicated against stale or divergent
constitutional state.

> **Improvement.** Adopt a **reference-monitor + distributed-enforcement** split (a classic
> from secure OS design): the Constitution defines policy centrally, but enforcement is done by
> many lightweight, locally-cached **guards** that share a consistent policy snapshot. Policy
> updates are versioned; guards operate on a snapshot and a change to policy is itself a
> gated, versioned event. This keeps *authority* central and *enforcement* scalable — the same
> reason CPUs cache page-table permissions in a TLB rather than walking the table every access,
> with explicit shootdown on change.

**Weakness SC-2 — the Constitution is a single point of failure with no continuity model.**
If the adjudicator is unavailable or corrupted, fail-closed halts *everything*. For a deployed
AGI that may be unacceptable (halting a medical monitor), and it makes the adjudicator a
denial-of-service target: crash the Constitution to freeze the system.

> **Improvement.** The Safety Kernel floor (mechanical, §5) must be able to keep the system in a
> *safe degraded mode* when full constitutional adjudication is unavailable — allowing only
> pre-cleared, provably-reversible actions. This separates "can't reach the full Constitution"
> (degrade to the mechanical floor) from "the Constitution said no" (halt). The mechanical
> floor becomes the always-available continuity layer.

**Weakness SC-3 — no model for value/constitution drift across long horizons.** Over many
self-modifications and memory accumulations, the *effective* governance (what the system
actually does) can drift from the *nominal* Constitution even if each step is individually
compliant — the classic "each step is fine, the trajectory is not" problem the review keeps
surfacing (DF-1, S-3, TP-1 are all instances).

> **Improvement.** Add **trajectory-level governance**, not only step-level: periodic
> constitutional *audits* over the accumulated history (memory + self-mods + granted
> capabilities) that check the aggregate against the Constitution, with authority to force
> redress. Step-gating is necessary but provably insufficient against slow drift; the
> architecture needs a second timescale of governance.

---

## 11. Unnecessary complexity (the other direction)

A rigorous review must also cut, not only add. Two places the design is heavier than needed:

- **UC-1 — three separate re-validation gates may be one parameterized gate.** ⑧/⑩/⑫ share a
  structure (report-up → adjudicate → proceed/revise/halt). Modeling them as *one gate type
  parameterized by irreversibility class* (per CF-1) is simpler and prevents the three from
  drifting apart in behavior. Fewer distinct mechanisms, same coverage.
- **UC-2 — four verdicts may reduce to two + a target.** PROCEED/CONSTRAIN/REVISE/HALT is
  really {continue, stop} × {with/without added constraints} × {return target}. A smaller
  orthogonal basis (a verdict = allow-bit + constraint-delta + return-address) is cleaner to
  reason about and to verify than four named cases whose interactions must be individually
  specified.

Simplicity is a safety property: fewer distinct mechanisms means fewer places for the
guarantees to leak.

---

## 12. Consolidated improved architecture (summary of proposals)

The review's proposals cohere into a revised design with five structural additions and two
simplifications:

**Additions**
1. **Object-capability enforcement** (CE-1, CE-2, TP-2): unforgeable per-action tokens,
   attenuated delegation, registration as a self-mod-class operation. *Turns "no side door"
   from convention into structure — the foundation everything else rests on.*
2. **Bifurcated floor** (S-4, SC-2): a mechanical Safety Kernel (fast, non-bypassable, the
   continuity layer) beneath semantic constitutional adjudication (best-effort, honest about
   it). *Stops overselling non-bypassability and provides safe degraded mode.*
3. **Evaluator-proposer capability invariant + capability ceiling on self-mod** (S-3, S-3b):
   oversight may never fall behind the thing it oversees; an observable oversight metric makes
   it checkable. *The single most important safety addition.*
4. **Governance at influence, not only at write** (MG-1, TP-1, SC-3): memories carry their
   formation-context and are re-governed on recall; gating is against accumulated session
   exposure; periodic trajectory audits catch slow drift. *Closes the "each step fine,
   trajectory bad" class of holes.*
5. **Two-timescale + distributed enforcement** (SC-1, SC-3): central policy, distributed
   cached guards, plus step-gating and trajectory-auditing. *Makes central authority scale and
   catches drift.*

**Simplifications**
6. **One parameterized gate** typed by irreversibility class (UC-1, CF-1).
7. **Orthogonal verdict basis** = allow-bit + constraint-delta + return-address (UC-2).

**Two diagrams, not one** (H-1): separate the *authority* stack from the *control/interaction*
graph, so the legitimate up-calls are explicit and verifiable.

---

## 13. The deepest issue, named plainly

Every serious weakness above (S-1, S-3, DF-1, TP-1, SC-3) is an instance of one meta-problem:

> **The architecture governs steps well and trajectories poorly.**

Step-level gating — admission, three gates, per-action permission — is the design's strength.
But an advanced, self-improving, long-lived system is dangerous not primarily through any
single step but through the *accumulation*: drift of values, aggregation of individually-safe
capabilities, memories that launder context across sessions, a proposer that outgrows its
evaluator one compliant change at a time.

A governance architecture for AGI needs to be **two-dimensional**: strong step-gating (which
this design has) *and* strong trajectory-governance (which it lacks). The single most valuable
change is to elevate trajectory-level governance — oversight metrics, accumulated-exposure
gating, formation-context on memory, periodic audits, a capability ceiling that keeps the
overseer ahead of the overseen — from absent to first-class.

Get that second dimension right and the Constitution becomes not just a good gate at the door,
but a standing government over the system's whole life — which is what governing an AGI
actually requires.

---

## 14. What this review does not settle

Consistent with the design phase: this review proposes *architectural* directions, not
mechanisms. It does not specify the oversight metric's formula, the capability-token scheme,
the trade-off policy for weighable principles, or the audit cadence. Those are the next design
tasks — and each should itself be reviewed adversarially before being trusted.
