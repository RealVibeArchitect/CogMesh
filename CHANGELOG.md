<!--
SPDX-License-Identifier: AGPL-3.0-or-later
CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
-->

# Changelog

All notable changes to CogMesh are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added — public-release readiness

- **CODE_OF_CONDUCT.md** (Contributor Covenant 2.1) with a project-specific clause: engage in good
  faith with the safety posture — don't disguise governance-weakening changes or weaken the
  adversarial harnesses to sneak an unsafe change past them.
- **README** now showcases the Constitutional Governance core (a dedicated section + TOC entry + a
  TL;DR bullet + updated Project Status), so the single biggest piece of work is visible at the front
  door with its control-evidence (mutation 20/20, `sim:generational` 0 erosions, `redteam` 0 escapes).
- **CI** restructured: fast lint+test run across the Node matrix; the heavy governance harnesses
  (`mutation`, `sim:generational`, `redteam`) run once in a dedicated `governance` job — each exits
  non-zero on regression, so a change that weakens governance turns the check red. This is the check
  a reviewer looks at first on a governance PR.
- **package.json** metadata for npm/GitHub: `keywords`, `repository`, `homepage`, `bugs`, and a
  governance-inclusive `description`.

> Note for the maintainer before publishing: run `./scripts/setup-publish.sh <github-handle>` to
> fill the GitHub-handle placeholders in `package.json` (repository/homepage/bugs) and the READMEs,
> and set the citation/licensing-contact fields.

## [0.5.1] — 2026-07-11

### Added / Changed — deeper PAD↔governance coupling + THREAT_MODEL completion

- **Mood now reaches into the trust model, not just the constraint set.** Previously mood added
  weighable constraints (⇒ CONSTRAIN) and set a `moodConservativeness` scalar that nothing consumed.
  That scalar is now live: at/above a proof-demand threshold (default caution ≥ 0.85),
  `MoodConstraintPolicy` sets `demandConservativenessProof`, and the pipeline's `classify()` honors
  it by REVOKING the "a plain action is conservative by default" free pass — the action must now
  PROVE conservativeness with a certificate or escalate. So mood has two graded effects: moderate
  caution tightens (CONSTRAIN), extreme caution withdraws default trust (proof-or-escalate). Still
  strictly one-way: it can only remove a default trust, never grant one; a calm mood is unaffected.
- **Mood influence is now auditable.** Every mood-tightened decision appends a `mood` record
  (conservativeness, whether proof was demanded, constraints added) to the adjudicator's
  tamper-evident trajectory before the verdict — "why was this constrained/escalated?" is answerable
  from the hash chain, not just the ephemeral agent trace.
- `MoodConstraintPolicy` gains `demandProofAt` (constructor) and `demandProof` (in `deltaFor`'s
  return); `applyToIntent` threads `demandConservativenessProof` strictly additively (once demanded,
  a calmer subsequent read cannot clear it within the same intent). 3 new tests
  (`test/moodGovernance.test.mjs`, now 12): trajectory audit, a valid certificate satisfying the
  raised bar, and a bogus certificate still escalating under it.
- **THREAT_MODEL.md completed** for the mood surface: affect-manipulation is named as a crafted-input
  adversary vector (§1) whose worst case is excess caution; the mood coupling is listed among the
  enforced mechanisms (§2.2) with its tests and mutants; and the summary table (§6) reflects it.

### Changed

- Version 0.5.0 → 0.5.1. Full suite: 370 tests (was 366). Governance mutation harness: 20/20 killed
  (was 19), adding a mutant that ignores the extreme-caution proof demand (trust-withdrawal defeated).

## [0.5.0] — 2026-07-11

### Added — governance core wired into AgentLoop, PAD→governance coupling, docs

- **The whole governance core now composes through a real `AgentLoop`** — not just unit contracts.
  Tools declare their governance nature via a `governance` block on `defineTool`
  (`irreversible`, `oracleClass`, `selfModify`, `reachExpands`, `modifiesCanaryClass`), and the
  loop threads it into each gate intent so S-1 calibration, S-4 tiering, and the S-3 self-mod
  checks fire on actual agent actions. `test/governanceIntegration.test.mjs` (8): a benign tool
  proceeds end-to-end; a forbidden tool is mechanically blocked; an irreversible oracle-backed
  tool escalates until its class earns calibrated trust (or an anchor authorizes it); a self-mod
  tool carrying canary-class harm is blocked and freezes the capability; and — the golden
  invariant at the agent level — a dead adjudicator paralyzes the agent. This integration exposed
  a real composition subtlety: an unregistered irreversible tool hits the S-4 semantic
  sound-default *before* the S-1 gate, so both fail-closed layers apply.
- **PAD mood → constitutional tightening** (`core/constitution/MoodConstraintPolicy.js`): the
  PAD-derived `caution` signal (core/pad/metacognition) now biases governance — but STRICTLY
  ONE-WAY. Mood can only ADD weighable constraints and raise a conservativeness demand; it can
  NEVER touch the inviolable Safety-Kernel floor, loosen a constraint, or rescue a HALT. The
  threat argument is explicit: if mood could loosen governance, inducing a mood would be an attack
  on safety, so a calm/confident state is a NO-OP on the floor, never a relaxation — the worst a
  mood can do is make the system too cautious (a liveness cost), never unsafe. Wired into
  `AgentLoop` via optional `moodProvider` + `moodPolicy`. `test/moodGovernance.test.mjs` (8):
  monotonicity, floor-untouchability at every caution level, add-only composition, the PAD bridge,
  and integration proof that high caution turns a PROCEED into a CONSTRAIN while never rescuing a
  block.
- `defineTool` gains a `governance` block (documented, normalized, back-compatible — a tool that
  declares none produces exactly the old conservative intent).

### Changed

- **THREAT_MODEL.md** rewritten from "two layers (library + design)" to "three maturities
  (implemented library / implemented governance core / open semantic frontier §13)." §2.2 now maps
  each S-1..S-5 + G-1..G-6 mechanism to its enforcing code and its evidence (tests + mutation +
  sims). **SECURITY.md** gains an explicit governance-escape scope (mint-while-down, forged-proof
  self-mod, stale-cache ALLOW, lease-for-irreversible, oracle-without-calibration, oversight
  erosion) and cross-links the `mutation`/`sim:generational`/`redteam` harnesses as the report bar.
- Version 0.4.1 → 0.5.0. Full suite: 366 tests (was 350). Governance mutation harness: 19/19
  killed (was 18), adding a mood-injects-inviolable-floor mutant (one-way violation).

## [0.4.1] — 2026-07-11

### Added — S-1 wired live + a red-team-found self-mod hole closed

- **S-1 calibration gate is now IN the hot path** (`AdjudicatorWorker` + `IsolatedAdjudicator`).
  An irreversible intent that justifies itself by an oracle prediction
  (`intent.irreversible` + `intent.oracleReliance.actionClass`) is only permitted to rely on that
  oracle for an action class with a measured, well-calibrated, tamper-intact track record in the
  in-worker `CalibrationLedger`. No record / too few samples / poor score / broken chain ⇒ escalate
  to the external anchor (fail-closed without one). Closed loop: `recordOutcome(class, {error})`
  feeds measured prediction error back, so a class earns — and can lose — irreversible-bet trust.
  `attest()` now reports per-class calibration + chain integrity. 11 tests
  (`test/calibrationGate.test.mjs`): cold-class escalation, earning trust, per-class isolation
  (no cross-class leakage), too-few-samples, poor-calibration refusal, degradation, anchor
  authorization, reversible-unaffected, tamper-evidence, predicted/actual normalization.
- **Red-team proposer loop** (`scripts/redteam-proposer.mjs`, `npm run redteam`): a self-mod
  proposer that OPTIMIZES to get a genuinely governance-weakening change admitted (forged
  full-battery proofs, targeted forgeries, disable-canary-first, freeze-exhaustion). Its FIRST
  run found a real escape — a forged proof claiming full canary coverage laundered a harmful
  self-mod (1/439). **Fixed**: the gate now applies two independent checks — GROUND TRUTH (the
  modification's actual canary-class harm, which a proof cannot launder) and COMPETENCE (the
  candidate evaluator must still cover the held-out battery). A proof is only ever a claim about
  the evaluator, never a certificate for the change. Re-run: **0 escapes / 500** adversarial
  proposals. 9 tests (`test/redteamSelfMod.test.mjs`) lock the fix, incl. the exact escape case.
- `CanaryBattery.checkBySandbox(candidateEvaluator)`: derive the caught-set by running a candidate
  evaluator against the held-out battery inside the trust boundary, instead of trusting a
  submitted proof (a throwing evaluator catches nothing — fail-closed).

### Changed

- Version 0.4.0 → 0.4.1. Full suite: 350 tests (was 331). Governance mutation harness: 18/18
  killed (was 16), adding an S-1 calibration-bypass mutant and a forged-proof-laundering mutant.

## [0.4.0] — 2026-07-10

### Added — S-4/S-5 semantic tiering, governance throughput, generational oversight

- **S-4 `HarmTaxonomy` + veto-only semantic tier** (`core/constitution/HarmTaxonomy.js`): the
  mechanical floor now ROUTES instead of judging — forbidden ⇒ fast deny, registered safe within
  bounds ⇒ fast pass, tagged or UNREGISTERED ⇒ semantic review (sound default). The host-side
  semantic evaluator is deadline-bounded and **veto-only** (final = pipeline ∧ semantic): it can
  subtract a permission, never grant one. No evaluator / error / blown deadline ⇒ fail-closed
  deny. Opt-in via `IsolatedAdjudicator({ taxonomy, semanticEvaluator, semanticDeadlineMs })`;
  without a taxonomy, behavior is unchanged. (`test/semanticTiering.test.mjs`, 14 tests)
- **S-5 `VerdictCache` + budgeted leases**: the latency/coverage horn is picked explicitly per
  class and priced. Epoch-keyed conservative cache — a stale entry may only DENY, never allow
  (ALLOWs die on any constraint tightening, canary freeze, or anchor event; DENYs survive
  epoch bumps). Budgeted lease tokens for classes with an explicit safe+reversible taxonomy
  claim: one recorded pipeline decision, N cheap HMAC redemptions via `useLease()`; refused
  fail-closed otherwise; leases die with the adjudicator. Measured (`npm run bench:governance`):
  full gate ≈3.3 ms/op (305 ops/s) vs cache ×16.7 (≈5.1k ops/s) vs lease ×52.0 (≈15.9k ops/s).
  (`test/scalability.test.mjs`, 11 tests — incl. a cache-key soundness bug the suite caught:
  CONSTRAIN verdicts were cacheable under a plain-intent key)
- **Generational oversight** (`core/constitution/GenerationalOversight.js`): six checkable
  invariants across self-modification lineages — G-1 floor-monotone, G-2 mechanism-retention,
  G-3 canary-non-regression, G-4 anchor-gated capability ceiling, G-5 lineage accountability
  (Merkle spine), G-6 rollback retention — with `GenerationLineage` accepting/refusing proposed
  generations fail-closed. Adversarial evidence (`npm run sim:generational`): 200-generation
  hostile lineage, **99/99 erosion attempts rejected (100%)**, 101 faithful generations accepted
  (liveness), whole lineage verifies from genesis, in-place tampering caught. Honest scope: this
  evidences the CHECKABLE structural half of §13; the semantic half stays open by design.
  (`test/generationalOversight.test.mjs`, 10 tests)
- **Mutation harness extended to 16 mutations** (was 11) covering the new surface: semantic
  fail-closed defaults (×2), stale-allow cache epoch bypass, lease-for-irreversible, and the
  G-4 ceiling — oracle now includes the three new suites.
- Attestation now reports `tiered`, `policyEpoch`, and cache stats.

### Changed

- `AdjudicatorWorker` gate flow: mechanical routing → canary → cache → pipeline → anchor/semantic
  parking → lease grant, with policy-epoch bumps on tightening/freeze/anchor events.
- Version 0.3.0 → 0.4.0. Full suite: 331 tests (was 295).

## [0.3.0] — 2026-07-10

### Added — S-1/S-2/S-3 governance hardening (from CONSTITUTION-REVIEW.md)

The three review findings that had "no independent check" / "no experimental data" are now
enforced in code, with empirical control-evidence. **295 tests passing (was 244); `npm run
mutation` reports a 100% kill rate against 11 governance-sabotage mutations.**

- **S-2 — the adjudicator is isolated in its own thread, and attacking it fails CLOSED.**
  The review named the adjudicator "the single most safety-critical component and the most
  attractive attack surface," with "no integrity model." It now runs in a dedicated worker
  (`core/constitution/AdjudicatorWorker.mjs`) that solely owns the kernel, the capability-mint
  secret, the governance trajectory, and all session state. The reasoning process talks to it
  only through `IsolatedAdjudicator` (`core/constitution/IsolatedAdjudicator.js`), a drop-in
  proxy with the same `admit`/`gate`/`reportUp`/`attest` surface. `AgentLoop` now `await`s
  its two constitution call sites (a no-op for the sync in-process runtime), so ONE loop
  drives either runtime — verified by two end-to-end drop-in contract tests, including
  "dead adjudicator ⇒ every tool call HALTs." The main thread cannot mint a token, mutate the trajectory, or fabricate
  an "already-authorized" context. **Golden invariant, contract-tested:** because mint + verify
  + consume all require the worker's secret, killing/crashing the adjudicator produces *paralysis,
  not freedom* — no valid token can be produced or redeemed, so every governed effect halts.
- **Wire-safe capability tokens** (`core/constitution/WireCapability.js`) — the in-process
  `Token`'s Symbol brand cannot cross a worker boundary (structuredClone strips Symbols and
  non-enumerable slots), which would have made isolation and unforgeability mutually exclusive.
  Wire tokens are instead plain data authenticated by an **HMAC-SHA-256 signature** over a
  canonical (key-order-independent) form, keyed by the worker-only secret, with in-worker
  one-shot consumption. Editing any field breaks the MAC; a foreign key cannot forge; a spent
  one-shot cannot replay — all contract-tested. No new dependency (node:crypto).
- **S-3 — an independent competence check on the evaluator** (`core/constitution/CanaryBattery.js`).
  The review: self-modification "evaluated by the pre-change Constitution" has "no independent
  check on the evaluator's competence." A **held-out battery of known-bad changes** now gates
  self-modification: before a self-mod is admitted, the (post-change) evaluator must still reject
  *every* canary; miss one and the change is hard-rejected and self-modification **freezes** until
  an out-of-band anchor lifts it (the system cannot self-unfreeze — contract-tested). Held-out +
  in-worker so a proposer can't optimize to the exam (Goodhart guard).
- **S-1 — the oracle's trust is bounded by its measured track record**
  (`core/world/CalibrationLedger.js`). The review: prediction "is treated as trustworthy" and
  the World Model's fallibility is never bounded. Calibration is now measured *per action class*;
  an irreversible action in a class with no track record — or a poorly-calibrated one — is denied
  reliance on the oracle and routes to the external anchor (fail-closed), exactly like an
  unclassifiable change. The ledger is **hash-chained and tamper-evident** (and lives in the
  worker in the isolated deployment), so the agent cannot fabricate calibration to open the
  irreversible-action gate; a broken chain makes every class read as uncalibrated.

### Added — empirical control-evidence (the missing "통제 가능성 증명")
- **`scripts/governance-mutation.mjs`** (`npm run mutation`) — mutation testing for the
  safety-critical governance source. It injects 11 semantically-dangerous sabotage mutations
  (accept an invalid token, reclassify a power-increasing change as conservative, make every
  signature "valid," let a spent token replay, make the canary check always pass, permit actions
  while the adjudicator is down, …) and measures how many are **caught** by the constitution +
  isolation tests. This is evidence, not assertion: a *surviving* mutant is a concrete hole. The
  first run surfaced 3 real gaps (a skippable INV-3 check, a self-unfreeze path, an unclassifiable-
  intent default); tests were added to close all three, and the harness now reports **11/11
  killed (100%)**. Wired into CI as a **blocking** check — a change that weakens governance
  undetectably turns the build red.
- **`examples/isolated-governance.mjs`** — runs all three findings end-to-end (kill-the-adjudicator
  paralysis, dulled-evaluator freeze, un-calibrated-class denial).
- New suites: `test/isolatedAdjudicator.test.mjs` (23, incl. two AgentLoop drop-in contracts), `test/calibrationLedger.test.mjs` (9).


## [0.2.0] — 2026-07-10 · Full-stack optimization pass

**Every number below is a measured median (scripts/bench.mjs, Node 22), same machine,
before → after. All 244 existing tests unchanged and passing; +17 new contract tests
guard the optimizations (261 total).**

### Performance
- **`WorldModel.branch()` rewritten as a direct structural clone** — the single hottest
  allocation site (every rollout branches the world). The old path went
  `snapshot() → restore()`, paying for intermediate arrays, `addObject`/`addRelation`
  re-validation, and an O(fields²) `setField` loop. Semantics identical (verified by a
  fast≡slow equivalence test). **7.84 → 3.91 ms / 200 branches (2.0×)**.
- **`WorldModel.setField()` is now an O(1) in-place write** instead of an O(fields)
  full-object rebuild. Observable behavior unchanged: snapshots were always copies.
- **`WorldSimulator` default apply no longer double-merges object state**
  (`addObject` already merges). Raw rollout **10.70 → 4.30 ms / 200 (2.5×)**.
- **`RolloutCache` memoizes cache keys per action reference** (`WeakMap`) — the mesh's
  dominant pattern is the *same action object* repeated (perspective siblings share one
  reference; elites carry theirs across cycles), so the hit path no longer pays a full
  recursive `stableStringify` per call. Value-equality semantics, LRU eviction, and
  `invalidate()` are unchanged (contract-tested). **Hit path 5.92 → 0.19 ms / 2000 (31×)**.
- **`SemanticRetriever.query()` rebuilt around a packed row-major matrix scan** —
  per-item inverse norms are precomputed at add time (one dot product per item instead
  of dot + two norms), rows live in one contiguous `Float64Array` (f32 values are exact
  in f64, so scores are **bit-identical** — verified against brute-force cosine ranking —
  while V8 skips a per-load f32→f64 conversion), the dot is 4-way unrolled, and top-k
  uses bounded insertion instead of sorting all n scored objects. The pack rebuilds
  lazily after mutations (staleness contract-tested).
  **k=5 over 2,000 items: 3.51 → 0.77 ms per query (4.6×)**.
- **`HashingEmbedder` hashes n-grams with a rolling FNV-1a over code units** — zero
  substring allocation (the old `slice()` path created O(len·ngram) short strings) —
  plus an LRU memo for repeated texts (agent loops re-embed the same goals constantly;
  `memo: 0` opts out; returned vectors are documented read-only).
  **Cold 1.6× · repeated-text ~50×**.
- **`MiniLMEmbedder.embedBatch()` performs true batched ONNX inference** — one
  `session.run()` for the whole batch with **dynamic padding to the batch max** instead
  of one run per text padded to a fixed 128 tokens. The exported model already declares
  dynamic `batch`/`seq` axes; older fixed-batch exports transparently fall back to the
  sequential path. On short KO/EN sentences this is typically a **3–10× throughput win
  on CPU and GPU** — and the sequential path itself stopped padding to 128.
- **`EvaluationCouncil`** hoists the reviewer index out of the per-candidate debate loop
  and aggregates peer opinions without per-opinion allocations (zero-weight fallback
  matched exactly). **`AttentionManager.prioritize()`** can reuse the salience scores
  `attend()` just computed — one salience model per cycle, one fewer full pass.
  **`AdaptiveMesh.prune()`** deletes in-place during Map iteration instead of copying
  every edge first. Full `CognitiveMesh.run()`: **1.62 → 1.05 ms (1.5×)**.

### Cost
- **`SemanticRetriever.serialize()` / `deserialize()`** — the index persists with vectors
  packed as base64 Float32 buffers, so a restart costs ~0 instead of re-embedding the
  corpus (embedding is the expensive step). Mismatched embedder kind/dim is refused
  rather than silently mixing vector spaces.
- **`package.json` ships a `files` whitelist** — the npm tarball carries the library
  (`index.js`, `core/`, `engines/`, licenses), not the training pipeline, docs, and tests.
- **`sideEffects: false`** — bundlers can tree-shake unused modules out of app builds.
- **CI installs from cache with `npm ci`** (`actions/setup-node` npm cache) and prints a
  report-only bench step, so perf regressions are visible in every PR without blocking.

### Structure
- **Root `index.js` façade + `exports` map** — `import { CogMeshAgent } from 'cogmesh'`
  now works, with per-domain subpaths (`cogmesh/pad`, `cogmesh/cognition`, …). Previously
  the package had no entry point at all.
- **`core/mesh/index.js` added** — the one module directory that lacked an index.
- **Fixed a silent `package.json` bug**: `test:integration` was defined twice, so the
  second definition shadowed the first and `integration.test.mjs` was unreachable via
  npm scripts. Both now run (`test:integration`, `test:cogmesh-agent`).
- **`engines: { node: ">=20" }`** declared; version bumped to 0.2.0.

### Added
- `scripts/bench.mjs` — reproducible hot-path benchmarks (`npm run bench`).
- `test/optimization.test.mjs` — 17 contracts locking in every rewrite above
  (branch isolation & equivalence, cache memo + LRU + invalidate, packed-scan ≡
  brute-force ranking, persistence roundtrip + vector-space guard, memo determinism,
  attention score reuse, root façade surface).
- **Cross-partition flow wired into CogMeshAgent — recalled memory (FLUID) → reasoning (FROZEN)**
  (`core/CogMeshAgent.js`, `examples/partition-flow-agent.mjs`) — the residual threat from
  `CONSTITUTION-PARTITION.md` is now governed in the running agent. Recalled memory is a *fluid*
  region (rewritten every LEARN step); the reasoning mesh is a *frozen* region (trusted logic). Before
  recalled memory may influence reasoning, the flow passes the `PartitionFlowController`: **FORBID**
  isolates reasoning from memory (recalled dropped — the frozen planner cannot be steered by a
  possibly-misaligned memory), while **ANCHOR** admits only memories tagged anchor-approved. The agent
  reasons cleanly in both cases (verified: reasoning completes even with memory fully isolated). This
  governs the *flow*, not the code — freezing the mesh's code would not stop a misaligned memory from
  steering it, so the memory's entry into reasoning is what's gated. Opt-in via a `partitionFlow` dep;
  without it, all recalled memory feeds reasoning as before. Test suite **241 → 244 passing**; new
  `partition-flow-agent.mjs` example.
- **External anchor interface formalized — trust reference + power authority, kept separate**
  (`core/constitution/ExternalAnchor.js`) — replaces the `{ authorize }` stub with the two-role
  interface the review proved must stay distinct (`CONSTITUTION-RESIDUES.md` W-3, `-CERTIFICATES.md`
  Part A): a **passive trust reference** `attest(measurement)` that only *compares* a live kernel
  measurement to a stored genuine one (tamper-evident: a substituted kernel yields a mismatch, not a
  forged all-clear) and an **active power authority** `authorize(request)` that *judges* whether a
  power increase may proceed. Merging them would smuggle the W-1 circularity into the trust root, so
  they are two methods with sharply different contracts. Ships `InProcessAnchor` (reference impl for
  testing; declares its measurement as the trust axiom) and `fromLegacyAuthorize` (adapts the old
  bool stub — and honestly reports non-genuine on attest since it holds no reference). `ConstitutionRuntime`
  now accepts both the formal anchor and the legacy stub, and `attest(kernelMeasurement)` integrates
  the anchor's trust reference with the trajectory-chain check.
- **Cross-partition information-flow control** (`core/constitution/PartitionFlow.js`) — implements the
  residual-threat treatment from `CONSTITUTION-PARTITION.md` §4. A FLUID (self-modifying) region
  feeding a FROZEN (trusted) region is the one cross-partition risk the review proved cannot be
  eliminated, only bound by exactly two sound treatments: **FORBID** the flow (isolation) or
  **ANCHOR** it (each fluid→frozen value must clear the external anchor before the frozen region
  trusts it). `PartitionFlowController` enforces precisely those two and refuses to invent a third
  "free and safe" path — an undeclared fluid→frozen flow defaults to FORBID (fail-closed). Non
  fluid→frozen flows carry no cross-partition risk and pass. The controller governs the *flow*, not
  the code, because freezing a consumer's code does not isolate it from information flowing in. Test
  suite **231 → 241 passing**.
- **Conservativeness certificate checker — first typed-hole made real** (`core/constitution/ConservativenessCertificate.js`)
  — implements the W-1a / W-1a-ii checker from `CONSTITUTION-CERTIFICATES.md` and
  `CONSTITUTION-COVERAGE.md`. A certificate is a **derivation** (ordered steps, each naming an
  approved reachability-preserving transformation and its site); the checker verifies (1) every step
  cites an entry in the frozen `APPROVED_TRANSFORMATIONS` catalog, (2) each step's fixed preconditions
  hold, and (3) the steps **cover the entire effect closure** (the W-1a-ii coverage check) — so it
  *checks a proof* rather than *reasoning about safety*, escaping the circularity. Honoring the
  `-TERMINATION` finding, any change flagged `touchesBehaviorDeterminingState` is rejected outright
  (route to anchor, never certifiable). Catalog *extension* deliberately throws — adding a
  transformation is a power-authorization act reserved for the external anchor, not an in-system
  operation. Wired into pipeline S2: a conservative self-modification **with a valid certificate now
  proceeds autonomously**, while a bare conservative *claim* without a certificate is not trusted —
  the first autonomous-yet-safe self-modification path in the running system.
- **Tools declare their own exposure** (`core/agent/Tool.js`, `core/agent/AgentLoop.js`) — `defineTool`
  now accepts `exposure: { reads, effects }` so a tool authoritatively declares what data domains it
  reads and what effectors it actuates, instead of the Constitution inferring exposure from the tool's
  name. Declared exposure is authoritative; name-based inference remains only as a fallback for tools
  that declare nothing (backward compatible). The accumulated-exposure gate (S4) now supports multiple
  domains/effectors per call, so a declared sensitive-read + outbound-effect sequence is blocked
  precisely. Test suite **221 → 231 passing**.
- **Constitution governs the full CogMeshAgent loop — learning now requires external sign-off**
  (`core/CogMeshAgent.js`, `examples/governed-cogmesh.mjs`) — the governance layer now reaches the
  **LEARN** step of the full perceive→remember→think→act→learn cycle. When a `CogMeshAgent` is given a
  `constitution`, memory formation (`retriever.add`) is routed through the persistence gate with
  `touchesBehaviorDeterminingState: true`, so — exactly as `CONSTITUTION-TERMINATION.md` proved — a
  memory write is classified power-increasing and **withheld unless an external anchor authorizes it**
  (recorded in the trace, never a crash). This turns the review's most important abstract finding
  ("a strongly self-modifying system cannot autonomously certify its own learning") into an actual,
  observable runtime behavior. One constitutional session spans the agent's life, so memories and
  their governance accumulate on a single audit trail across runs. Opt-in as always: without a
  `constitution`, learning is unchanged. Test suite **217 → 221 passing**; new `governed-cogmesh.mjs`
  example demonstrates withheld-vs-authorized learning.
- **Constitution wired into the AgentLoop — the first *governed* CogMesh agent** (`core/agent/AgentLoop.js`,
  `examples/governed-agent.mjs`) — the Constitution runtime is now connected to real action. When an
  AgentLoop is constructed with a `constitution`, it opens a constitutional session (`admit`) at run
  start and routes **every tool call through `runtime.gate()`** before it executes: a permitted call
  gets a freshly-minted capability token; a HALT/escalation becomes a tool-result-shaped observation
  the policy can react to (never a crash), preserving the loop's fault-tolerant contract. Accumulated
  exposure carries across steps, so a dangerous *sequence* (read a sensitive domain, then use an
  outbound effector) is blocked by the S4 gate even though each step alone is innocuous — demonstrated
  in the new example and covered by tests. Governance is **opt-in**: without a `constitution` the loop
  behaves exactly as before (existing behavior unchanged, no regression). Test suite **214 → 217
  passing**.
- **Constitution runtime — FIRST CODE IMPLEMENTATION** (`core/constitution/`) — the 12-document
  `CONSTITUTION*.md` design line becomes running, tested code (test suite 190 → **214 passing**). The
  codeable core skeleton from `CONSTITUTION-SPEC.md`: **unforgeable capability tokens**
  (`Capability.js` — object-capability model with a private module-local brand; forged/spread-copied
  objects and unbranded construction are all rejected, verified by test), the **constraint lattice**
  (`ConstraintSet.js` — *no loosen operation exists*, so monotonic tightening is structural not a
  rule), the **decision context** (`DecisionContext.js` — immutable, tighten-only), the
  **append-only tamper-evident trajectory** (`GovernanceTrajectory.js` — hash-chained, integrity-
  verifiable, no mutation methods), the **Frozen Kernel** (`FrozenKernel.js` — fixed structural
  invariants INV-1/2/3/4/5), the **S1–S5 rule evaluation pipeline** (`RuleEvaluationPipeline.js` —
  each stage fail-closed; power-increasing / behavior-determining changes escalate to the external
  anchor rather than self-certifying, honoring the -TERMINATION finding), **conflict resolution**
  (`ConflictResolution.js` — inviolable/weighable two tiers, escalate-not-fake), the **orthogonal
  verdict basis** (`Verdict.js`), and the composing **runtime** (`ConstitutionRuntime.js` —
  admit/gate/reportUp/attest). Building the code surfaced a real design bug (an INV-1 circularity:
  "acting needs a token" vs. "the gate mints the token" deadlocked the first gate call); fixed by
  checking a token only when one is *presented* (use) vs. *requested* (mint). Deferred typed holes
  (proven hard/impossible inside the system) escalate to the external anchor rather than faking a
  decision: the kernel's full invariant content, the sound static classifier interior, the anchor's
  attestation protocol, the cross-partition flow discipline, and the weighable preference policy.
- **CogMesh Constitution — design specification** (`CONSTITUTION-SPEC.md`) — turns the governance
  *architecture* into implementable **runtime structures and interfaces** (types, component contracts,
  control flow) while staying at the spec level. Specifies (1) the **Constitution Runtime** (Frozen
  Kernel + Adjudication Body + Integrity Monitor + Governance Trajectory, with entry points
  admit/gate/report_up/attest), (2) the **Constitutional Decision Context** (a session-carried object
  whose ConstraintSet is a lattice with *no loosen operation* — monotonic tightening by omission — and
  whose capability tokens are unforgeable/non-transitive/attenuating), (3) the **Rule Evaluation
  Pipeline** (S1 kernel screen → S2 sound-over-approximation classification → S3 constraint check → S4
  accumulated-exposure check → S5 verdict assembly, each fail-closed), and (4) **Conflict Resolution**
  (inviolable constraints never traded off; weighable principles resolved explicitly, recorded, and
  trajectory-aware, escalating to the external anchor where the review proved the system cannot decide
  alone). Crucially, it is **constraint-respecting by construction**: every point the review proved
  undecidable-inside (fluid power-increase, cross-partition trust) is a typed escalation to the anchor,
  not a faked decision. Includes a traceability table mapping each structure back to the review finding
  it resolves.
- **THREAT_MODEL.md** — a plain-spoken threat model stating what CogMesh prevents, what it *cannot*
  prevent, and what it assumes, across both the implemented library (real, runnable) and the
  Constitution governance architecture (design only). Its most important content is what it admits it
  cannot do: no safe open-ended autonomous self-improvement (a proven dichotomy, not a tunable dial);
  no autonomous certification of learning without external sign-off; no elimination of cross-partition
  contamination; no self-rooted trust; and no defense against a compromised host. Assumptions are
  declared (trusted execution environment, an honest faithfully-operated external anchor, explicit
  design-time partition, sound static checks, faithful future implementation) so the guarantees'
  conditionality is explicit. Complements SECURITY.md (which covers vulnerability reporting for the
  code).
- **CogMesh Constitution — attacking the partition principle** (`CONSTITUTION-PARTITION.md`) —
  self-directed attack on the convergence doc's partition principle. Unlike termination and
  convergence (both refuted), the partition principle **survives, conditionally**: premises P1/P3
  (boundary drawable / self-protecting) hold *because the boundary is fixed at design time*, making
  "does this change touch the frozen region?" a static check rather than a circular inference; but P2
  (isolation) breaks — freezing a region's *code* does not isolate it if information flows in from the
  fluid region, so isolation costs either improvement-starvation (forbid the flow) or interface-
  anchoring (govern the flow), never free. The surviving-but-costly principle leaves one residual
  threat that cannot be designed away — **cross-partition information flow** — which is handed to the
  threat model as an explicitly unmitigated risk. First of the three deep claims to survive its own
  attack, because it is the most modest: it localizes the hard core to a declared boundary rather than
  claiming to eliminate it.
- **CogMesh Constitution — attacking the convergence claim** (`CONSTITUTION-CONVERGENCE.md`) —
  self-directed attack on the termination doc's fallback that the recursion at least *converges*.
  **It does not.** Convergence-by-contraction needs a metric (E1, never defined — an ordering
  mistaken for a magnitude), a contraction factor k<1 (E2), and monotonicity (E3). E2 fails
  decisively: a *sound* over-approximation of "behavior-determining state" must tag **nearly
  everything** in a system with a fluid data/code boundary (any datum can be wired into the decision
  path by a later self-modification), so the residue does not shrink — the recursion **saturates at
  the first step** (safe but inert), rather than converging. What replaces convergence is a
  **dichotomy, not a spectrum**: a fixed-boundary system has a shallow recursion (safe *and* useful,
  but weakly self-modifying), while a fluid-boundary system saturates (safe *and* inert). There is no
  convergent middle where a system is *strongly* self-modifying *and* contracts to a small autonomous
  residue. The deepest conclusion: **safety-vs-autonomy is not a dial but a dichotomy forced by the
  degree of self-modification — a sufficiently self-modifying system cannot be both safe and
  autonomously self-improving**, because soundness itself forbids conservatively certifying "this
  rewrite won't increase my power" about a system that can rewire what counts as power. The corrected
  mandate is a **partition principle**: autonomy is available only in regions frozen against
  boundary-rewriting; every region left fluid must be fully externally anchored.
- **CogMesh Constitution — attacking the termination argument** (`CONSTITUTION-TERMINATION.md`) —
  self-directed adversarial attack on the coverage doc's claim that the recursion *terminates* at the
  effect-closure check. **The claim was wrong.** A real counterexample — the most important case for a
  self-improving system, a **learned-weight update** — defeats it: the effect closure captures a
  change's *reach* ("what can it touch?") but not its *behavior-within-reach* ("does it act
  differently in what it touches?"), so a weight update that holds reach fixed while transforming
  behavior is mis-certified as conservative (a catastrophic false negative), and the dynamic
  circularity returns in full. The repair: coverage must treat any change to **behavior-determining
  state** (weights, policies, thresholds, the model) as power-increasing by default and route it to
  the external anchor — a static structural check on *which kind of state* changed, not on what it
  will do — at the severe cost that *every learning update needs external sign-off*. The deeper
  correction: there is **no circularity-free floor**; the recursion does not terminate, it
  **converges** — each conservative static over-approximation shrinks the residual circularity but
  never to zero, and the external anchor is not a terminating base case but the catch-all for the
  never-quite-zero residue. A weaker, more honest claim than the coverage doc made.
- **CogMesh Constitution — the coverage check & the floor of the recursion (W-1a-ii)**
  (`CONSTITUTION-COVERAGE.md`) — resolves the last purely-architectural hard point. The coverage
  check must confirm a conservativeness-derivation explains the *entire* change; the trap is that a
  code-diff can be fully covered while the change's effect lives outside the code (in config, data,
  weights it references). The fix: coverage over the **effect closure** (everything the change can
  transitively read/write), soundly *over-approximated* from the static dependency graph. Crucially,
  this does **not** hide another circularity, and the document proves the seven-document recursion
  *terminates here*: every prior hard point was a **dynamic** question ("what will it do?",
  answerable only by being the future system → circular), whereas the effect closure is a **static**
  question ("what can it touch?", readable from the present reference structure → not circular). The
  circularity was never about complexity but about *tense*; it ends the moment the question becomes
  static. The remaining residues are engineering (a sound static analyzer) and one values decision
  (the safety-vs-autonomy dial) — no hidden circularity waits one level down. The whole effort's arc:
  *measure capability → classify power → certify non-expansion → check derivation coverage → read the
  static effect closure.*
- **CogMesh Constitution — certificates & the convergence claim (W-1a)**
  (`CONSTITUTION-CERTIFICATES.md`) — Part A adversarially reviews the round-5 "same external
  anchor" convergence claim and finds it an overreach: the trust reference (W-3) is a *passive*
  minimal datum while the power authority (W-1) demands *active judgment*, so merging them smuggles
  the W-1 circularity back into the trust root and destroys its stability. The salvageable truth is
  weaker — the system needs **two distinct external dependencies** (a passive trust reference and
  an active power authority), which must stay separate because their operational tempos conflict.
  Part B then designs the conservativeness-certificate language: rather than certify outcome
  equivalence (intractable), a certificate is a **derivation** proving the change is composed of
  pre-approved reachability-preserving transformations (caching, dead-branch elimination,
  parallelization, …), which the kernel checks mechanically (catalog lookup + fixed preconditions +
  full-diff coverage). This converts the frequent "is this change conservative?" into a mechanical
  kernel check and narrows the active external authority's job to one precise, rare task — *curating
  the transformation catalog*. The irreducible hard core is now compressed to two small points:
  catalog curation (external) and derivation coverage-checking (W-1a-ii).
- **CogMesh Constitution — the two hard residues (W-1, W-3)** (`CONSTITUTION-RESIDUES.md`) —
  frontally attacks the two problems the prior documents compressed everything into. Both are
  shown unsolvable *as posed* and reframed into tractable problems by one shared move: *stop
  trying to be right; make being wrong impossible to hide.* **W-1** (the power-increase
  classifier) becomes a **sound over-approximation**: exploiting the asymmetric cost of
  misclassification (a false "conservative" is catastrophic, a false "power-increase" is merely
  slow), a two-tier classifier has the kernel enforce a sound structural default while a capable-
  but-untrusted Body may only *narrow* it via a kernel-checkable conservativeness certificate — so
  a compromised Body can attack autonomy, never safety. **W-3** (the attestation root) becomes a
  **tamper-evident** root: the unverified trust seed is minimized to a single reference
  measurement, externalized outside the governed system, and observed by comparison so a corrupted
  kernel produces a mismatch at an external anchor rather than a forged all-clear. Both residues
  converge on one honestly-declared external dependency — *safe self-improvement is not fully
  autonomous self-improvement.*
- **CogMesh Constitution — Frozen Kernel & the reachability problem** (`CONSTITUTION-KERNEL.md`) —
  Part B adversarially tests whether the reachability judgment (F1) escapes the capability-
  measurement circularity and finds it escapes *partially, not fully*: structurally conservative
  (Class 1) and structurally expansive (Class 2) changes are decided statically without
  circularity, but behaviorally-expansive (Class 3) changes — deeper planning/search within
  existing effectors — re-introduce a contained version of the circularity, so Class 3 is routed
  to external anchoring (default) with sandboxed staging and the action-time kernel as backstops.
  Part A then designs the Frozen Kernel's invariant set: seven structural/provenance invariants
  (token-gated action, staged self-mod, intact trajectory chain, non-reducible oversight,
  external-anchored power increases, always-reachable safe state, non-starvable kernel) that
  protect the *preconditions of governance itself* rather than defining good behavior — "the
  kernel guarantees the frame absolutely; the picture inside is best-effort." The line of
  reasoning compresses the irreducible difficulty to one acknowledged-open point (W-1: the
  power-increase classifier cannot be both simple-enough-to-trust and smart-enough-to-be-sure).
- **CogMesh Constitution — review round 2** (`CONSTITUTION-REVIEW-2.md`) — Part A adversarially
  re-reviews the trajectory-governance extension and finds its central mechanism unsound: the
  Oversight Ledger's "evaluator competence ≥ proposer capability" is structurally circular
  (measuring the gap requires already closing it; the dimension taxonomy is itself gameable), and
  symmetric self-adjudication reintroduces correlated blind spots. It replaces measurement with
  **containment** (advance power only under a reachability proof; anchor power-increases
  externally; oversee via a frozen invariant-checking kernel — "oversight must be unboundedly
  *simple*, not unboundedly capable"). Part B designs the two deferred findings: **S-2** via a
  three-part adjudicator (immutable verified Frozen Kernel + mutable governed Adjudication Body +
  Integrity Monitor) and **CE-1** via an object-capability model (unforgeable per-action tokens,
  non-transitive attenuating delegation, registration as a self-mod-class event). Both rounds
  converge on one object: a small immutable root of trust plus an unforgeable capability system.
- **CogMesh Constitution — trajectory governance extension** (`CONSTITUTION-TRAJECTORY.md`) —
  resolves the two highest-priority review findings (S-3, the evaluator-proposer capability gap;
  and §13, "governs steps well, trajectories poorly") with one unifying construct: an append-
  only, L0-owned **Governance Trajectory** and three mechanisms over it — the **Oversight
  Ledger** (makes the Evaluator-Proposer Capability Invariant checkable so oversight never falls
  behind the proposer, via symmetric adjudication / external derivation / a capability ceiling),
  the **Accumulated-Exposure Gate** (gates on aggregate cross-action flow with attenuated
  delegation), and the **Constitutional Audit** (a second, trajectory-level timescale of
  governance with redress authority, formation-context on memory, and governed forgetting). Its
  organizing principle: *govern the derivative, not just the value.* Architecture only.
- **CogMesh Constitution — architecture review** (`CONSTITUTION-REVIEW.md`) — a research-level
  adversarial review of the Constitution architecture from four vantage points (AGI research,
  AI safety, large-scale systems, chip architecture). Covers all ten review axes, identifies
  the load-bearing weaknesses (oracle problem, unspecified adjudicator integrity, evaluator-
  proposer capability gap in self-modification, semantic-vs-mechanical enforcement gap,
  central-adjudication scaling), and proposes improved architectures with reasoning
  (object-capability enforcement, a bifurcated mechanical/semantic floor, a capability ceiling
  keeping oversight ahead of the proposer, governance-at-influence for memory, two-timescale
  distributed enforcement). Its central finding: the design governs *steps* well and
  *trajectories* poorly, and trajectory-level governance must become first-class.
- **CogMesh Constitution — architecture design** (`CONSTITUTION.md`) — defines the highest
  governing layer of CogMesh: a layer hierarchy (L0 Constitution → L1 Safety Kernel → L2
  Metacognition → L3 Cognition → L4 Grounding → L5 Memory & Learning), the full control flow
  from input to action with constitutional gates before every irreversible step (act, output,
  persist), two-directional data flow (downward constraints + upward report-up), enforcement
  &amp; automatic inheritance for future modules, and the self-modification validation model
  (propose-then-validate, guardrail-preservation, monotonic oversight). Architecture only — no
  articles or algorithms yet. `ARCHITECTURE.md` is reorganized so every module explicitly
  operates under the Constitution.
- **`CogMeshAgent` — full system integration** (`core/CogMeshAgent.js`) — composes every
  subsystem into one perceive→remember→think→act→learn loop. Multimodal perception feeds the
  shared vector space that semantic retrieval searches; recalled memories become reasoning
  context; the mesh (with meta-reasoning + stability) decides; the agent loop grounds it via
  tools; and the outcome is embedded back into memory so future recall is richer — a closed
  loop, not a one-shot pipeline. Every subsystem is injectable and degrades gracefully when
  absent. See `examples/full-agent.mjs`.
- **Robust self-improvement / StabilityGuard** (`core/cognition/StabilityGuard.js`) — a
  supervisor the mesh consults each cycle. Isolates poisoned (NaN/Infinity) candidates BEFORE
  they can enter ranking or become synthesis feedstock (a real contamination path confirmed by
  stress-testing), detects plateaus via early-stopping **patience** rather than a single-epsilon
  check, and flags repeated best-score regression as instability. `CognitiveMesh.run()` now
  returns a `stability` block (improvement trajectory, trend, poisoned-dropped count). Disable
  with `config.stability: false`.
- **Multimodality via a shared embedding space** (`core/multimodal/`) — `ImageEncoder`
  (CLIP-style ONNX locally, with a deterministic pixel-feature fallback) and `VideoEncoder`
  (keyframe sampling + aggregation). Because images/video embed into the SAME space as text,
  the existing `SemanticRetriever` searches all modalities with no new logic.
- **Real-world grounding: tools + agent loop** (`core/agent/`) — a `Tool`/`ToolRegistry`
  boundary for side effects, an `AgentLoop` running observe→decide→act (bounded,
  fault-tolerant, safe-mode), a `rulePolicy` seam, and `meshPolicy`/`meshDecider` to let the
  CognitiveMesh drive tool selection. Ships pure built-in tools (calculator, memo) for tests
  and simple agents; real-world tools are supplied by the host.
- **Local semantic retrieval / RAG-like recall** (`core/retrieval/`) — `SemanticRetriever`
  (embed-once vector store with top-k cosine search) + `EmbeddingProvider`. Primary backend
  is the same multilingual MiniLM that powers the PAD encoder, exported to ONNX
  (`training/scripts/export_embedder.py`) and run locally via `onnxruntime-node` — no
  embedding API. Degrades to a dependency-free lexical embedder when the model isn't present.
  `SemanticMemory` gains `recall(query, {k})` for meaning-based fact retrieval (backward
  compatible — key-value behavior unchanged without a retriever).
- **Meta-Reasoner** (`core/cognition/MetaReasoner.js`) — selects *how* to think
  (Intuitive / Deliberate / Divergent / Skeptical) from the situation and reconfigures the
  mesh's knobs (beam width, debate rounds, attention breadth, exploration). Complements
  `boundedRationality` (which decides *how much* compute). Wired into `CognitiveMesh.run()`;
  the chosen strategy is returned as `result.strategy`. Disable with `config.metaReason: false`.
- **Attention Manager** (`core/cognition/AttentionManager.js`) — scores cognitive
  perspectives for the current situation (goal keywords + PAD mood) and attends to the top
  few, with `safety` always on. Cuts ~50% of per-cycle nodes while keeping the winner.
  Disable with `config.attention: false`.
- **Rollout cache / incremental reasoning** (`core/cognition/RolloutCache.js`) — memoizes
  pure world rollouts across cycles; ~93% fewer real simulations on the default loop, with
  identical results. Deep-freezes returned futures to prevent cache corruption. On by
  default; disable with `config.cache: false`.
- **True multi-core parallelism** (`core/cognition/WorkerPool.js`,
  `rolloutWorker.mjs`, `ParallelWorldSimulation.simulateParallel`) — a reusable worker-thread
  pool for rollouts, with an honest cost model: it auto-falls-back to in-thread execution
  below a work threshold, on single-core machines, or when the simulator uses custom
  functions (which can't cross the thread boundary).
- **Brain-like Parallel Cognitive Mesh** (`core/cognition/`) — the full self-revising cycle:
  Decomposition → Parallel Simulation → Evaluation Council (with debate/peer-review) →
  Conflict → Synthesis → Regeneration → Adaptive Mesh → Resource Manager, orchestrated by
  `CognitiveMesh.js`.
- **PAD coordinate sync guard** (`scripts/check-pad-sync.mjs`, `npm run check:pad-sync`) —
  fails if the 20 core-emotion PAD coordinates drift between `core/pad/emotionMap.js` and
  `training/src/utils.py`.
- **ONNX export now saves the tokenizer** alongside the model, so web/JS inference can turn
  text into input ids without a separate download.
- Project documentation: `ARCHITECTURE.md`, `SECURITY.md`, `CHANGELOG.md`.
- Examples: `examples/cognitive-mesh.mjs`, `examples/worker-benchmark.mjs`.
- Tests for all new cognition modules (cognitive cycle, rollout cache, worker pool,
  attention, meta-reasoner).

### Changed
- `WorldSimulator` now retains `goalWeights` (as `_goalWeights`) when using the default
  apply/score, enabling worker-thread reconstruction. Purely additive — no behavior change
  for existing callers; custom-function simulators keep this `null` and stay single-threaded.
- `RegenerationEngine` collides genuinely distinct candidates (skips near-duplicate actions)
  so synthesis produces new ideas rather than no-ops.

### Fixed
- `CognitiveMesh` convergence check compared against the post-update best, causing premature
  convergence; it now compares against the previous best.
- Documentation/code mismatch: `training/src/model.py` and `training/README.md` advertised
  4-bit quantization that wasn't implemented; wording corrected to reflect the actual
  LoRA-based path (4-bit noted as future work).

## [0.1.0]

Initial public foundation.

### Added
- Core cognitive modules: World Model + Simulator, PAD emotion system, tiered Memory
  (Working / Semantic / Episode / Reflection) with compression, Confidence & Self-Correction,
  Planner / Goal Manager / Bounded Rationality, Mesh Router with domain-engine registry.
- Domain-engine stubs: `finance`, `legal`, `coding`, `general`.
- Python training pipeline for the PAD encoder (MiniLM + LoRA), with ONNX export and a seed
  emotion dataset (~332 Korean text→PAD samples).
- Bilingual documentation (English / Korean), whitepaper, roadmap, and dual AGPL-3.0 /
  commercial licensing.
- Test suite and ESLint flat-config setup.

[Unreleased]: https://github.com/RealVibeArchitect/CogMesh/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/RealVibeArchitect/CogMesh/releases/tag/v0.1.0
