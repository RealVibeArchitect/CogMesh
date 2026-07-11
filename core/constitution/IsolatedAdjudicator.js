// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/constitution/IsolatedAdjudicator.js — main-thread proxy to the isolated adjudicator.
//
// This is what the cognitive mesh / agent talks to. It presents the SAME surface as the
// in-process ConstitutionRuntime — admit(), gate(), reportUp(), attest() — so it is a drop-in,
// with one difference the whole design turns on: the actual decision happens in a SEPARATE
// worker thread that owns the kernel, the mint secret, the trajectory, and all session state.
//
// The proxy holds NONE of the trusted state. It cannot mint a token, cannot mutate the
// trajectory, cannot fabricate an "already-authorized" context. It can only marshal a request,
// send it, and return the worker's verdict. That is the point of S-2 isolation: the most
// safety-critical component is unreachable from the (possibly-compromised) reasoning process.
//
// FAIL-CLOSED SEMANTICS (the golden invariant, host side):
//   Every method returns a HALT verdict if the worker is unavailable — not started, crashed,
//   terminated, or timed out. Combined with the worker owning the mint, this means: if the
//   adjudicator dies, the host cannot obtain a valid token, so every governed effect stops.
//   Killing the adjudicator yields paralysis, not freedom.
//
// ASYNC: because the boundary is a message round-trip, gate()/admit()/attest() are async. The
// AgentLoop already awaits them (a bare `await` on the old sync runtime is a harmless no-op), so
// the same loop drives either the in-process runtime or this isolated one.
//
// External anchor: an anchor decision is an out-of-band trust root the worker deliberately cannot
// make for itself. When the worker escalates, gate() returns a verdict carrying an `anchorTicket`;
// the host resolves it through its OWN anchor (injected here) and the proxy re-submits the
// decision. If no anchor is configured, escalations stay denied (fail-closed).

import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = join(HERE, 'AdjudicatorWorker.mjs');

/** A plain, host-side view of a verdict (mirrors the fields the worker serializes). */
function haltVerdict(reason) {
  return { name: 'HALT', permits: false, reason, externalAnchorRequired: false, constraintDelta: null };
}

export class IsolatedAdjudicator {
  /**
   * @param {object} [opts]
   * @param {{ inviolable?:string[], weighable?:string[] }} [opts.baseConstraints]
   * @param {object} [opts.partitionTags]  region → 'FROZEN'|'FLUID'
   * @param {{ authorize(request):boolean|{authorized:boolean} }} [opts.externalAnchor]
   *        host-side anchor consulted when the worker escalates. Absent ⇒ escalations deny.
   * @param {object} [opts.taxonomy]  HarmTaxonomy JSON (S-4). Present ⇒ three-tier routing
   *        activates in the worker; absent ⇒ pipeline-only behavior, exactly as before.
   * @param {{ evaluate(intent):Promise<{harmful:boolean,reason?:string}> }} [opts.semanticEvaluator]
   *        host-side slow semantic reviewer (S-4). VETO-ONLY: its judgment can subtract a
   *        pipeline permission, never grant one. Absent ⇒ semantic-tier intents fail CLOSED.
   * @param {number} [opts.semanticDeadlineMs]  budget for one semantic review; on expiry the
   *        review resolves harmful:true (fail-closed) — slow judgment defaults to deny.
   * @param {number} [opts.timeoutMs]  per-request timeout; on expiry the request fails closed (HALT).
   */
  constructor({ baseConstraints = null, partitionTags = {}, externalAnchor = null,
    taxonomy = null, semanticEvaluator = null, semanticDeadlineMs = 1500, calibration = null, timeoutMs = 5000 } = {}) {
    this._baseConstraints = baseConstraints;
    this._partitionTags = partitionTags;
    this._anchor = externalAnchor;
    this._taxonomy = taxonomy;
    this._semantic = semanticEvaluator;
    this._semanticDeadlineMs = semanticDeadlineMs;
    this._calibration = calibration;
    this._timeoutMs = timeoutMs;
    this._worker = null;
    this._rid = 0;
    this._pending = new Map(); // rid → { resolve, timer }
    this._down = false;        // true once the worker has crashed/terminated
    this._downReason = null;
  }

  /** Spawn the adjudicator worker and wait until it's live. Idempotent. */
  async start() {
    if (this._worker) return this;
    this._down = false;
    this._downReason = null;
    this._worker = new Worker(WORKER_PATH, {
      workerData: { baseConstraints: this._baseConstraints, partitionTags: this._partitionTags, taxonomy: this._taxonomy, calibration: this._calibration },
    });
    this._worker.on('message', (msg) => this._onMessage(msg));
    this._worker.on('error', (err) => this._onDown(`worker error: ${String(err && err.message || err)}`));
    this._worker.on('exit', (code) => { if (code !== 0) this._onDown(`worker exited (code ${code})`); });
    return this;
  }

  _onMessage(msg) {
    const rid = msg && msg.rid;
    const p = this._pending.get(rid);
    if (!p) return;
    clearTimeout(p.timer);
    this._pending.delete(rid);
    p.resolve(msg);
  }

  /** Mark the adjudicator down and fail every in-flight request closed. */
  _onDown(reason) {
    this._down = true;
    this._downReason = reason;
    for (const [, p] of this._pending) {
      clearTimeout(p.timer);
      p.resolve({ type: 'error', verdict: haltVerdict(`adjudicator unavailable: ${reason}`) });
    }
    this._pending.clear();
  }

  /** Send one request; resolves with the worker reply, or a fail-closed HALT if unavailable. */
  _send(op, payload = {}) {
    if (this._down || !this._worker) {
      return Promise.resolve({ type: 'error', verdict: haltVerdict(`adjudicator unavailable: ${this._downReason || 'not started'}`) });
    }
    const rid = ++this._rid;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this._pending.delete(rid);
        resolve({ type: 'error', verdict: haltVerdict(`adjudicator timeout after ${this._timeoutMs}ms`) });
      }, this._timeoutMs);
      // don't let the timer keep the event loop alive
      if (typeof timer.unref === 'function') timer.unref();
      this._pending.set(rid, { resolve, timer });
      this._worker.postMessage({ rid, op, ...payload });
    });
  }

  /**
   * admit(): open a governed session. Returns a host-side context stub carrying only the opaque
   * sessionId (the real DecisionContext lives in the worker). On failure, a HALT verdict.
   * @returns {Promise<{ ctx:{ sessionId:string|null }, verdict:object }>}
   */
  async admit(request = {}) {
    const reply = await this._send('admit', { request: { origin: request.origin || 'unknown' } });
    if (reply.type !== 'admitted') return { ctx: { sessionId: null }, verdict: reply.verdict || haltVerdict('admit failed') };
    return { ctx: { sessionId: reply.sessionId }, verdict: reply.verdict };
  }

  /**
   * gate(): request authorization for an irreversible transition. Handles anchor escalation by
   * consulting the host anchor and re-submitting. Returns { verdict, token, ctx }.
   *   • token is WIRE-SIGNED PLAIN DATA (or null) — safe to attach to a tool ctx.
   *   • ctx is the same sessionId stub, threaded forward for the caller's convenience.
   * @param {object} intent  { action, args?, requiresToken?, kind?, argBounds?, validity?, exposureDelta?, selfModify?, evaluatorProof? }
   * @param {{ sessionId:string }} ctx
   */
  async gate(intent, ctx = {}) {
    const sessionId = ctx.sessionId;
    if (!sessionId) return { verdict: haltVerdict('gate without a session'), token: null, ctx };

    let reply = await this._send('gate', { sessionId, intent });

    // anchor escalation round-trip
    if (reply.anchorTicket) {
      const authorized = this._resolveAnchorLocally(intent);
      reply = await this._send('resolveAnchor', { ticket: reply.anchorTicket, authorized });
    }

    // S-4 semantic review round-trip — deadline-bounded and fail-closed. The worker parked the
    // (already-permitting) pipeline verdict; here the host's slow evaluator gets ONE bounded
    // chance to veto. No evaluator, an error, or a blown deadline all resolve harmful:true.
    if (reply.semanticTicket) {
      const judgment = await this._reviewSemantically(intent);
      reply = await this._send('resolveSemantic', { ticket: reply.semanticTicket, harmful: judgment.harmful, reason: judgment.reason });
    }

    return { verdict: reply.verdict || haltVerdict('gate failed'), token: reply.token || null, ctx: { sessionId }, lease: reply.lease, cached: reply.cached };
  }

  /** Run the host semantic evaluator under the deadline. Every failure mode is harmful:true. */
  async _reviewSemantically(intent) {
    if (!this._semantic || typeof this._semantic.evaluate !== 'function') {
      return { harmful: true, reason: 'no semantic evaluator configured (fail-closed)' };
    }
    let timer;
    try {
      const deadline = new Promise((resolve) => {
        timer = setTimeout(() => resolve({ harmful: true, reason: 'semantic deadline exceeded (fail-closed)' }), this._semanticDeadlineMs);
        if (typeof timer.unref === 'function') timer.unref();
      });
      const judged = Promise.resolve(this._semantic.evaluate(intent))
        .then((r) => ({ harmful: r?.harmful !== false, reason: r?.reason || '' })) // only an explicit false clears
        .catch((err) => ({ harmful: true, reason: `semantic evaluator error (fail-closed): ${String(err && err.message || err)}` }));
      return await Promise.race([judged, deadline]);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * useLease(): redeem one use of a previously granted lease token (S-5 fast path). One HMAC
   * verification + budget decrement in the worker — no pipeline re-run. Fails closed when the
   * adjudicator is down (a lease dies with the worker: paralysis covers leases too).
   * @returns {Promise<{ ok:boolean, remaining?:number, reason?:string }>}
   */
  async useLease(token, action, args = {}) {
    const reply = await this._send('useLease', { token, action, args });
    if (reply.type !== 'leaseUsed') return { ok: false, reason: reply.verdict?.reason || 'lease redemption failed' };
    return { ok: reply.ok, remaining: reply.remaining, reason: reply.reason };
  }

  /**
   * recordOutcome(): feed a measured prediction↔outcome error for an action class back into the
   * adjudicator's calibration ledger (S-1 closed loop). This is how a class earns — or loses —
   * the standing to have an irreversible action rely on the oracle. Fails closed when the
   * adjudicator is down (like everything else here).
   * @param {string} actionClass
   * @param {{ error?:number, predicted?:number, actual?:number, scale?:number }} outcome
   * @returns {Promise<{ ok:boolean, calibrated?:boolean, score?:number, n?:number, reason?:string }>}
   */
  async recordOutcome(actionClass, outcome = {}) {
    const reply = await this._send('recordOutcome', { actionClass, outcome });
    if (reply.type !== 'recorded') return { ok: false, reason: reply.verdict?.reason || 'record failed' };
    return { ok: reply.ok, calibrated: reply.calibrated, score: reply.score, n: reply.n, reason: reply.reason };
  }

  /** reportUp(): a module surfaces an intended irreversible action (same path as gate). */
  reportUp(event, ctx) { return this.gate(event, ctx); }

  /** Consult the host-side external anchor for a parked escalation. Fail-closed if absent. */
  _resolveAnchorLocally(intent) {
    if (!this._anchor || typeof this._anchor.authorize !== 'function') return false;
    let result;
    try { result = this._anchor.authorize(intent); } catch { return false; }
    if (typeof result === 'boolean') return result;
    return !!(result && result.authorized === true);
  }

  /**
   * attest(): integrity status of the isolated adjudicator (chain intact + not canary-frozen).
   * @returns {Promise<{ genuine:boolean, chainIntact:boolean, canaryFrozen:boolean }>}
   */
  async attest() {
    const reply = await this._send('attest');
    if (reply.type !== 'attestation') return { genuine: false, chainIntact: false, canaryFrozen: null, reason: reply.verdict?.reason };
    return {
      genuine: reply.genuine,
      chainIntact: reply.chainIntact,
      canaryFrozen: reply.canaryFrozen,
      tiered: reply.tiered,
      policyEpoch: reply.policyEpoch,
      cache: reply.cache,
      calibration: reply.calibration,
      calibrationIntact: reply.calibrationIntact,
    };
  }

  /** A read-only trajectory snapshot for host-side audit. */
  async trajectorySnapshot() {
    const reply = await this._send('trajectory');
    return reply.type === 'trajectory' ? { snapshot: reply.snapshot, intact: reply.intact } : { snapshot: null, intact: false };
  }

  /** Canary battery status (for monitoring self-mod freezes). */
  async canaryStatus() {
    const reply = await this._send('canaryStatus');
    return reply.type === 'canaryStatus' ? reply : null;
  }

  /** True once the adjudicator has gone down (crash/terminate). Governed effects then all HALT. */
  get isDown() { return this._down; }

  /** Terminate the worker. After this, every gate() fails closed — the system is paralyzed, safely. */
  async stop() {
    if (!this._worker) return;
    const w = this._worker;
    this._worker = null;
    this._onDown('stopped by host');
    await w.terminate();
  }
}
