// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/constitution/AdjudicatorWorker.mjs — the governance decision, isolated in its own thread.
//
// This is the safety-critical core (S-2: "the adjudicator is the single most safety-critical
// component and the most attractive attack surface") moved OUT of the reasoning process.
// Everything that must be trusted lives here and NOWHERE else:
//
//   • the FrozenKernel + RuleEvaluationPipeline (the actual verdict computation)
//   • the WireCapabilityMint's secret key   → only this thread can mint/verify/consume tokens
//   • the GovernanceTrajectory (hash-chained audit log)
//   • per-session DecisionContext state     → the main thread never holds a context, only a sessionId
//
// The main thread (where the cognitive mesh / agent runs) can ONLY send request messages and
// receive verdicts. It cannot reach into the kernel, cannot obtain the mint key, cannot mutate
// the trajectory, cannot fabricate a context that says "already authorized". If the main thread
// is fully compromised, the worst it can do is ASK — and a compromised asker still gets denied
// by a kernel it cannot touch.
//
// GOLDEN INVARIANT (why isolation is a safety gain, not a refactor):
//   mint + verify + consume all require this worker's secret. Kill this worker and no valid
//   token can be produced or redeemed ⇒ every governed effect halts. Attacking the adjudicator
//   yields paralysis, not freedom. Fail-closed by construction.
//
// Protocol: one request → one reply, correlated by `rid`. Message shapes are documented at each
// handler. All inputs are treated as untrusted (they come from the possibly-compromised main
// thread): every handler validates before acting, and any thrown error becomes a fail-closed
// HALT reply rather than a crash.

import { parentPort, workerData } from 'node:worker_threads';

import { ConstraintSet } from './ConstraintSet.js';
import { DecisionContext } from './DecisionContext.js';
import { GovernanceTrajectory } from './GovernanceTrajectory.js';
import { FrozenKernel } from './FrozenKernel.js';
import { RuleEvaluationPipeline } from './RuleEvaluationPipeline.js';
import { Verdict } from './Verdict.js';
import { WireCapabilityMint } from './WireCapability.js';
import { CanaryBattery } from './CanaryBattery.js';
import { HarmTaxonomy } from './HarmTaxonomy.js';
import { VerdictCache, verdictCacheKey } from './VerdictCache.js';
import { CalibrationLedger } from '../world/CalibrationLedger.js';

// ── the trusted state, constructed once, never exposed ──────────────────────
const mint = new WireCapabilityMint(); // fresh random secret; never leaves this worker
const trajectory = new GovernanceTrajectory();
const kernel = new FrozenKernel({ trajectory });
const pipeline = new RuleEvaluationPipeline({
  kernel,
  recordToTrajectory: (event) => trajectory.append(event),
});
const canary = new CanaryBattery(); // held-out safety regressions for self-mod gating (S-3)

// S-4: the mechanical routing floor. OPTIONAL and boot-time-immutable: with no taxonomy the
// worker behaves exactly as before (pipeline only); with one, the three-tier routing activates.
// Changing the taxonomy is a governance act (new worker boot), not a runtime call.
const taxonomy = workerData?.taxonomy ? HarmTaxonomy.fromJSON(workerData.taxonomy) : null;

// S-5: the conservative verdict cache + the policy epoch it is keyed to. Any event that could
// make an old ALLOW unsound bumps the epoch, killing every cached ALLOW at once (see bumpEpoch).
const cache = new VerdictCache(workerData?.cache || {});
let policyEpoch = 0;
function bumpEpoch(why) { policyEpoch++; trajectory.append({ kind: 'epoch', epoch: policyEpoch, why }); }

// S-5: lease budgets — tokenId → remaining uses. Lives with the mint secret: a lease dies with
// the worker (the paralysis invariant covers leases too — no worker, no redemption).
const leaseBudgets = new Map();

// S-4: parked semantic reviews (like anchor escalations): ticket → { intent, sessionId, verdict }
let semanticPending = null;

// S-1: the calibration ledger lives INSIDE the adjudicator, hash-chained and trusted like the
// trajectory. An irreversible action that justifies itself by oracle prediction ("this is safe
// because the world model predicts a benign outcome") is only allowed to rely on that oracle for
// an action CLASS with a measured, well-calibrated track record. No record / poor score / broken
// chain ⇒ reliance refused ⇒ escalate to the anchor, exactly like an unclassifiable change.
const ledger = new CalibrationLedger(workerData?.calibration || {});

const baseConstraints = rebuildConstraints(workerData?.baseConstraints) || ConstraintSet.empty();
const partitionTags = workerData?.partitionTags || {};
// External anchor authority is an out-of-band trust root. The worker cannot itself hold the
// anchor's judgment (that would defeat the point), so anchor escalations are surfaced to the
// HOST via a reply the host must resolve through its own anchor and re-submit. See resolveAnchor.
let anchorPending = null;

const sessions = new Map(); // sessionId → DecisionContext (state the main thread never sees)
let genuine = true;

// ── message loop ────────────────────────────────────────────────────────────
parentPort.on('message', (msg) => {
  const rid = msg && msg.rid;
  let reply;
  try {
    reply = dispatch(msg);
  } catch (err) {
    // any failure in the safety core fails CLOSED — a HALT the host can react to, never a crash
    reply = { type: 'error', verdict: serializeVerdict(Verdict.halt(`adjudicator error: ${String(err && err.message || err)}`)) };
  }
  parentPort.postMessage({ rid, ...reply });
});

function dispatch(msg) {
  switch (msg && msg.op) {
    case 'admit':        return onAdmit(msg);
    case 'gate':         return onGate(msg);
    case 'resolveAnchor':return onResolveAnchor(msg);
    case 'resolveSemantic': return onResolveSemantic(msg);
    case 'useLease':     return onUseLease(msg);
    case 'recordOutcome': return onRecordOutcome(msg);
    case 'attest':       return onAttest(msg);
    case 'trajectory':   return onTrajectory();
    case 'canaryStatus': return { type: 'canaryStatus', ...canary.status() };
    default:
      return { type: 'error', verdict: serializeVerdict(Verdict.halt(`unknown op '${msg && msg.op}'`)) };
  }
}

// ── admit(): open a governed session; the CONTEXT stays here, only the id goes out ──
// msg: { op:'admit', request:{ origin } }
function onAdmit(msg) {
  const origin = (msg.request && msg.request.origin) || 'unknown';
  trajectory.append({ kind: 'admit', origin });
  const ctx = new DecisionContext({
    constraints: baseConstraints,
    partitionTags,
    trajectoryRef: trajectory.snapshot(),
    provenance: { origin },
  });
  sessions.set(ctx.sessionId, ctx);
  return { type: 'admitted', sessionId: ctx.sessionId, verdict: serializeVerdict(Verdict.proceed('admitted')) };
}

// ── gate(): the core decision. Runs the pipeline; mints a WIRE token on permit. ──
// msg: { op:'gate', sessionId, intent:{ action, args?, requiresToken?, kind?, argBounds?, validity?,
//        exposureDelta?, selfModify?, evaluatorProof?, lease?:{uses,ttlMs} } }
function onGate(msg) {
  const ctx = sessions.get(msg.sessionId);
  if (!ctx) return { type: 'gated', verdict: serializeVerdict(Verdict.halt('unknown session (not admitted)')), token: null };

  const intent = msg.intent || {};

  // ── MOOD AUDIT: if this intent arrived carrying mood-derived tightening, record that fact in
  // the tamper-evident trajectory BEFORE any verdict. This makes "why was this action constrained
  // / escalated?" auditable after the fact — the mood that influenced the decision is on the
  // hash chain, not just in the ephemeral agent trace. Recording is passive: the worker does not
  // trust the mood to loosen anything (it structurally cannot), it just notes its presence.
  if (intent.demandConservativenessProof || (intent.moodConservativeness || 0) > 0) {
    trajectory.append({
      kind: 'mood',
      action: intent.action,
      conservativeness: +(intent.moodConservativeness || 0).toFixed(3),
      demandedProof: !!intent.demandConservativenessProof,
      addedWeighable: (intent.addConstraints && intent.addConstraints.weighable ? intent.addConstraints.weighable.length : 0),
    });
  }

  // ── S-4 TIER 1: the mechanical floor ROUTES (a lookup, never a judgment) ──
  const route = taxonomy ? taxonomy.classify(intent) : null;
  if (route && route.tier === 'mechanical-deny') {
    trajectory.append({ kind: 'mechanical-deny', action: intent.action });
    return { type: 'gated', verdict: serializeVerdict(Verdict.halt(`mechanical floor: ${route.reason}`)), token: null, sessionId: msg.sessionId };
  }

  // S-3 gate: a self-modifying change must pass the canary battery BEFORE the pipeline even
  // considers it. TWO independent checks, because a proposer-supplied proof is forgeable:
  //   (a) GROUND TRUTH — if the modification descriptor itself declares (or is detected to carry)
  //       a canary-class harm, it is rejected outright. A change that IS a 'disable-canary' cannot
  //       launder itself with a proof claiming it catches disable-canary attempts; its own nature
  //       is what's judged. This closes the forged-full-proof hole the red-team harness found.
  //   (b) COMPETENCE — the candidate evaluator must still catch every held-out canary. A proof is
  //       accepted only as a claim ABOUT THE EVALUATOR; it never certifies the change itself.
  if (intent.selfModify) {
    // (a) ground-truth harm in the modification itself — never trust the change to grade itself
    const declaredHarm = Array.isArray(intent.modifiesCanaryClass) ? intent.modifiesCanaryClass
      : (intent.modifiesCanaryClass ? [intent.modifiesCanaryClass] : []);
    if (declaredHarm.length > 0) {
      canary.freeze(`self-mod carries canary-class harm: ${declaredHarm.join(', ')}`);
      bumpEpoch('self-mod harm detected');
      return { type: 'gated', verdict: serializeVerdict(Verdict.halt(`self-mod rejected: modification embodies canary-class harm (${declaredHarm.join(', ')}) — a proof cannot launder the change itself`)), token: null, sessionId: msg.sessionId };
    }
    // (b) evaluator competence — the proof is a claim about the EVALUATOR, checked against the battery
    const check = canary.check(intent.evaluatorProof);
    trajectory.append({ kind: 'canary', outcome: check.pass ? 'pass' : 'fail', missed: check.missed });
    if (!check.pass) {
      canary.freeze(`missed canaries: ${check.missed.join(', ')}`);
      bumpEpoch('canary freeze'); // an evaluator regression invalidates every cached ALLOW
      return { type: 'gated', verdict: serializeVerdict(Verdict.halt(`self-mod rejected: evaluator missed ${check.missed.length} canary case(s)`)), token: null, sessionId: msg.sessionId };
    }
    if (canary.frozen) {
      return { type: 'gated', verdict: serializeVerdict(Verdict.halt('self-mod frozen (prior canary failure)')), token: null, sessionId: msg.sessionId };
    }
  }

  // ── S-5: conservative cache — only for plain, non-self-mod, non-lease, non-semantic intents.
  // A hit means "the pipeline already answered this exact question, under this exposure state,
  // in the current policy epoch (for ALLOW) or any epoch (for DENY — always sound)."
  const cacheable = !intent.selfModify && !intent.lease && !intent.irreversible && (!route || route.tier === 'mechanical-pass');
  const key = cacheable ? verdictCacheKey(intent, ctx) : null;
  if (key) {
    const hit = cache.get(key, policyEpoch);
    if (hit) {
      if (!hit.permits) {
        return { type: 'gated', verdict: hit, token: null, sessionId: msg.sessionId, cached: true };
      }
      // a cached ALLOW still mints fresh (tokens are never cached — each is one authority grant)
      const { token, ctx: nextCtx } = mintForVerdictData(hit, intent, ctx);
      sessions.set(msg.sessionId, nextCtx);
      return { type: 'gated', verdict: hit, token, sessionId: msg.sessionId, cached: true };
    }
  }

  // ── S-1: oracle-reliance gate. If an IRREVERSIBLE intent justifies its safety by an oracle
  // prediction (intent.oracleReliance.actionClass), that reliance is only honored for a class
  // with a measured, well-calibrated, tamper-intact track record. Otherwise the oracle is not
  // trusted for an irreversible bet and the decision escalates to the external anchor — the same
  // fail-closed destination as an unclassifiable change. This is the ledger doing real work in
  // the hot path, not sitting beside it.
  if (intent.irreversible && intent.oracleReliance) {
    const cls = intent.oracleReliance.actionClass;
    const t = ledger.trust(cls);
    trajectory.append({ kind: 'calibration', actionClass: cls, calibrated: t.calibrated, score: +t.score.toFixed(3), n: t.n });
    if (!t.calibrated) {
      const ticket = `anchor_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      anchorPending = { ticket, intent, sessionId: msg.sessionId };
      return {
        type: 'gated',
        verdict: serializeVerdict(Verdict.escalate(`S1 calibration: oracle not trusted for irreversible '${cls}' — ${t.reason}`)),
        token: null, anchorTicket: ticket, sessionId: msg.sessionId,
      };
    }
  }

  let verdict = pipeline.evaluate(intent, ctx);
  if (verdict.constraintDelta) bumpEpoch('constraint tightening'); // old ALLOWs may now be unsound

  // Anchor escalation: the worker cannot decide this alone (by design). Park it and ask the host
  // to resolve through its out-of-band anchor, then re-submit via resolveAnchor. Fail-closed
  // until then: no token is minted, the action does not proceed.
  if (verdict.externalAnchorRequired) {
    const ticket = `anchor_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    anchorPending = { ticket, intent, sessionId: msg.sessionId };
    trajectory.append({ kind: 'anchor', action: intent.action, outcome: 'pending-host' });
    return { type: 'gated', verdict: serializeVerdict(verdict), token: null, anchorTicket: ticket, sessionId: msg.sessionId };
  }

  if (key) cache.put(key, serializeVerdict(verdict), policyEpoch);

  // ── S-4 TIER 3: semantic review — VETO-ONLY. Runs only if the pipeline already permits;
  // it can subtract that permission, never grant one the pipeline refused (final = pipeline ∧
  // semantic). Parked like an anchor escalation; the host resolves under a deadline, and the
  // proxy fails CLOSED (harmful:true) on timeout or a missing evaluator.
  if (verdict.permits && route && route.tier === 'semantic') {
    const ticket = `sem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    semanticPending = { ticket, intent, sessionId: msg.sessionId, verdict };
    trajectory.append({ kind: 'semantic', action: intent.action, outcome: 'pending-review', why: route.reason });
    return { type: 'gated', verdict: serializeVerdict(verdict), token: null, semanticTicket: ticket, sessionId: msg.sessionId };
  }

  // ── S-5: lease grant — the explicit throughput horn for PROVABLY conservative classes only.
  // Requires (a) a taxonomy entry tagged safe+reversible (unregistered ⇒ refused: no shortcut
  // without an explicit reversibility claim on record), and (b) a permitting pipeline verdict.
  // The grant is ONE fully-recorded decision; redemptions are cheap authenticated consumptions.
  if (intent.lease) {
    if (!verdict.permits) {
      return { type: 'gated', verdict: serializeVerdict(verdict), token: null, sessionId: msg.sessionId };
    }
    if (!taxonomy || !taxonomy.leaseable(intent.action)) {
      trajectory.append({ kind: 'lease', action: intent.action, outcome: 'refused' });
      return { type: 'gated', verdict: serializeVerdict(Verdict.halt('lease refused: action not provably leaseable (fail-closed)')), token: null, sessionId: msg.sessionId };
    }
    const uses = Math.max(1, Math.floor(intent.lease.uses || 1));
    const ttlMs = Math.max(1, Math.floor(intent.lease.ttlMs || 60_000));
    const token = mint.mint({
      action: intent.action,
      argBounds: intent.argBounds || null,
      validity: 'window',
      expiresAt: Date.now() + ttlMs,
    });
    leaseBudgets.set(token.id, uses);
    trajectory.append({ kind: 'lease', action: intent.action, outcome: 'granted', uses, ttlMs });
    const nextCtx = ctx.withVerdict('PROCEED').withToken({ id: token.id, lease: true });
    sessions.set(msg.sessionId, nextCtx);
    return { type: 'gated', verdict: serializeVerdict(Verdict.proceed(`lease granted: ${uses} uses / ${ttlMs}ms`)), token, lease: { uses, ttlMs }, sessionId: msg.sessionId };
  }

  const { verdict: v2, token, ctx: nextCtx } = mintForVerdict(verdict, intent, ctx);
  sessions.set(msg.sessionId, nextCtx);
  return { type: 'gated', verdict: serializeVerdict(v2), token, sessionId: msg.sessionId };
}

// ── resolveAnchor(): host reports its out-of-band anchor decision for a parked escalation ──
// msg: { op:'resolveAnchor', ticket, authorized:boolean }
function onResolveAnchor(msg) {
  if (!anchorPending || anchorPending.ticket !== msg.ticket) {
    return { type: 'gated', verdict: serializeVerdict(Verdict.halt('no matching anchor ticket')), token: null };
  }
  const { intent, sessionId } = anchorPending;
  anchorPending = null;
  const ctx = sessions.get(sessionId);
  if (!ctx) return { type: 'gated', verdict: serializeVerdict(Verdict.halt('session gone')), token: null };

  if (msg.authorized !== true) {
    trajectory.append({ kind: 'anchor', action: intent.action, outcome: 'denied' });
    return { type: 'gated', verdict: serializeVerdict(Verdict.halt('escalation denied by external anchor')), token: null, sessionId };
  }
  trajectory.append({ kind: 'anchor', action: intent.action, outcome: 'authorized' });
  bumpEpoch('anchor authorization'); // power state changed — old cached ALLOWs may be unsound
  const permit = Verdict.proceed('authorized by external anchor');
  const { verdict: v2, token, ctx: nextCtx } = mintForVerdict(permit, intent, ctx);
  sessions.set(sessionId, nextCtx);
  return { type: 'gated', verdict: serializeVerdict(v2), token, sessionId };
}

// ── resolveSemantic(): host reports the semantic evaluator's review for a parked ticket ──
// msg: { op:'resolveSemantic', ticket, harmful:boolean, reason?:string }
// VETO-ONLY by construction: this handler can only HALT, or finalize the pipeline verdict that
// was ALREADY computed and stored at park time. There is no code path here that upgrades a
// pipeline denial — a lying or compromised semantic evaluator gains nothing the mechanical
// layers had not already granted.
function onResolveSemantic(msg) {
  if (!semanticPending || semanticPending.ticket !== msg.ticket) {
    return { type: 'gated', verdict: serializeVerdict(Verdict.halt('no matching semantic ticket')), token: null };
  }
  const { intent, sessionId, verdict } = semanticPending;
  semanticPending = null;
  const ctx = sessions.get(sessionId);
  if (!ctx) return { type: 'gated', verdict: serializeVerdict(Verdict.halt('session gone')), token: null };

  if (msg.harmful === true || msg.harmful == null) { // absent/undefined judgment ⇒ fail closed
    trajectory.append({ kind: 'semantic', action: intent.action, outcome: 'vetoed', why: msg.reason || 'fail-closed' });
    return { type: 'gated', verdict: serializeVerdict(Verdict.halt(`semantic veto: ${msg.reason || 'fail-closed (no judgment)'}`)), token: null, sessionId };
  }
  trajectory.append({ kind: 'semantic', action: intent.action, outcome: 'cleared', why: msg.reason || '' });
  const { verdict: v2, token, ctx: nextCtx } = mintForVerdict(verdict, intent, ctx);
  sessions.set(sessionId, nextCtx);
  return { type: 'gated', verdict: serializeVerdict(v2), token, sessionId };
}

// ── useLease(): redeem one use of a granted lease — the S-5 fast path ──
// msg: { op:'useLease', token, action, args? }
// Cost: one HMAC verification + a budget decrement. No pipeline, no fresh trajectory entry per
// use (the grant was the recorded decision; redemptions are its bounded exercise). The lease is
// still fully inside the paralysis invariant: verification needs the worker's secret, so a dead
// adjudicator means no redemption.
function onUseLease(msg) {
  const token = msg.token;
  const check = mint.verify(token, msg.action, msg.args || {});
  if (!check.ok) return { type: 'leaseUsed', ok: false, reason: check.reason };
  const remaining = leaseBudgets.get(token.id);
  if (remaining == null) return { type: 'leaseUsed', ok: false, reason: 'not a lease token (no budget on record)' };
  if (remaining <= 0) return { type: 'leaseUsed', ok: false, reason: 'lease budget exhausted' };
  leaseBudgets.set(token.id, remaining - 1);
  if (remaining - 1 === 0) trajectory.append({ kind: 'lease', action: msg.action, outcome: 'exhausted', tokenId: token.id });
  return { type: 'leaseUsed', ok: true, remaining: remaining - 1 };
}

/** Mint against a CACHED (already-serialized) permitting verdict — same rules as mintForVerdict. */
function mintForVerdictData(verdictData, intent, ctx) {
  let token = null;
  let nextCtx = ctx.withVerdict(verdictData.name);
  if (verdictData.permits && intent.requiresToken) {
    token = mint.mint({
      action: intent.action,
      argBounds: intent.argBounds || null,
      validity: intent.validity || 'one-shot',
    });
    nextCtx = nextCtx.withToken({ id: token.id });
  }
  if (verdictData.permits && intent.exposureDelta) {
    nextCtx = nextCtx.withExposure(intent.exposureDelta);
  }
  return { token, ctx: nextCtx };
}

// ── recordOutcome(): close the S-1 loop. After an action of a given class resolves, the host
// reports the measured prediction error back into the ledger, so the class's calibration reflects
// reality and future oracle-reliance decisions are grounded in an up-to-date track record. A
// class earns trust by being right repeatedly; it loses it the same way. The ledger is hash-
// chained, so these records are tamper-evident.
// msg: { op:'recordOutcome', actionClass, outcome:{ error? | predicted?,actual?,scale? } }
function onRecordOutcome(msg) {
  if (!msg.actionClass) return { type: 'recorded', ok: false, reason: 'actionClass required' };
  const head = ledger.record(msg.actionClass, msg.outcome || {});
  const t = ledger.trust(msg.actionClass);
  return { type: 'recorded', ok: true, head, calibrated: t.calibrated, score: +t.score.toFixed(3), n: t.n };
}

// mint a wire token if the verdict permits and the intent needs one; thread ctx changes forward
function mintForVerdict(verdict, intent, ctx) {
  let token = null;
  let nextCtx = ctx.withVerdict(verdict.name);
  if (verdict.permits && intent.requiresToken) {
    token = mint.mint({
      action: intent.action,
      argBounds: intent.argBounds || null,
      validity: intent.validity || 'one-shot',
    });
    nextCtx = nextCtx.withToken({ id: token.id }); // context records only the token id, not its sig
  }
  if (verdict.permits && intent.exposureDelta) {
    nextCtx = nextCtx.withExposure(intent.exposureDelta);
  }
  return { verdict, token, ctx: nextCtx };
}

// ── attest(): integrity of the isolated adjudicator (Integrity Monitor) ──
// msg: { op:'attest' }
function onAttest() {
  const chainOk = trajectory.verifyIntegrity();
  return {
    type: 'attestation',
    genuine: genuine && chainOk && !canary.frozen,
    chainIntact: chainOk,
    canaryFrozen: canary.frozen,
    sessions: sessions.size,
    policyEpoch,
    cache: cache.stats(),
    tiered: !!taxonomy,
    calibration: ledger.report(),
    calibrationIntact: ledger.verifyIntegrity(),
  };
}

// ── trajectory(): a read-only snapshot for host-side audit ──
function onTrajectory() {
  return { type: 'trajectory', snapshot: trajectory.snapshot(), intact: trajectory.verifyIntegrity() };
}

// ── helpers ─────────────────────────────────────────────────────────────────

/** Serialize a frozen Verdict to plain data for the wire (name + permit bit + reason). */
function serializeVerdict(v) {
  return {
    name: v.name,
    permits: v.permits,
    reason: v.reason,
    externalAnchorRequired: v.externalAnchorRequired,
    constraintDelta: v.constraintDelta ? serializeConstraints(v.constraintDelta) : null,
  };
}

function serializeConstraints(cs) {
  return { inviolable: [...(cs.inviolable || [])], weighable: [...(cs.weighable || [])] };
}

function rebuildConstraints(data) {
  if (!data) return null;
  return new ConstraintSet({
    inviolable: new Set(data.inviolable || []),
    weighable: new Set(data.weighable || []),
  });
}
