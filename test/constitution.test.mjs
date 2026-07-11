// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// test/constitution.test.mjs — the first CODE realization of the CONSTITUTION*.md design line.
//
//   node --test test/constitution.test.mjs
//
// Verifies the spec's load-bearing contracts by execution (per the project's "verify, don't trust"
// philosophy): unforgeable tokens, no-loosen lattice, fail-closed pipeline, power-increase
// escalation, accumulated-exposure gating, conflict resolution tiers, and trajectory integrity.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CapabilityMint, verify, consume,
  ConstraintSet, DecisionContext, GovernanceTrajectory,
  FrozenKernel, ConstitutionRuntime, Verdict, resolveConflict,
} from '../core/constitution/index.js';

// ---------- capability tokens: unforgeability (CE-1) ----------

test('capability: a minted token authorizes its action', () => {
  const mint = new CapabilityMint();
  const t = mint.mint({ action: 'tool:calc' });
  assert.equal(verify(t, 'tool:calc'), true);
});

test('capability: a forged look-alike object is rejected', () => {
  const fake = { action: 'tool:calc', authorizes: () => true };
  assert.equal(verify(fake, 'tool:calc'), false);
});

test('capability: a spread-copied token loses its brand and is rejected', () => {
  const mint = new CapabilityMint();
  const t = mint.mint({ action: 'tool:calc' });
  assert.equal(verify({ ...t }, 'tool:calc'), false);
});

test('capability: wrong action is rejected', () => {
  const mint = new CapabilityMint();
  const t = mint.mint({ action: 'tool:calc' });
  assert.equal(verify(t, 'tool:other'), false);
});

test('capability: attenuation keeps the parent action and records lineage', () => {
  const mint = new CapabilityMint();
  const parent = mint.mint({ action: 'tool:calc' });
  const child = mint.attenuate(parent, { argBounds: { max: 100 } });
  assert.equal(child.action, parent.action);
  assert.equal(child.parent, parent.id);
});

test('capability: a consumed one-shot token no longer authorizes', () => {
  const mint = new CapabilityMint();
  const t = mint.mint({ action: 'x', validity: 'one-shot' });
  consume(t);
  assert.equal(verify(t, 'x'), false);
});

// ---------- constraint lattice: monotonic tightening by omission ----------

test('constraints: there is no loosen operation (structural monotonicity)', () => {
  const cs = ConstraintSet.empty().tighten({ inviolable: ['a'] });
  assert.equal(typeof cs.loosen, 'undefined');
  assert.equal(typeof cs.remove, 'undefined');
  assert.equal(typeof cs.delete, 'undefined');
});

test('constraints: tighten accumulates and never drops', () => {
  const a = ConstraintSet.empty().tighten({ inviolable: ['x'] });
  const b = a.tighten({ weighable: ['y'] });
  assert.equal(b.hasInviolable('x'), true);
  assert.equal(b.has('y'), true);
});

test('constraints: meet is the union (most-restrictive-wins)', () => {
  const a = ConstraintSet.empty().tighten({ inviolable: ['x'] });
  const b = ConstraintSet.empty().tighten({ inviolable: ['z'] });
  const m = a.meet(b);
  assert.equal(m.hasInviolable('x'), true);
  assert.equal(m.hasInviolable('z'), true);
});

// ---------- trajectory: append-only + tamper-evident ----------

test('trajectory: chain verifies intact after appends', () => {
  const tr = new GovernanceTrajectory();
  tr.append({ kind: 'a' });
  tr.append({ kind: 'b' });
  assert.equal(tr.verifyIntegrity(), true);
  assert.equal(tr.length, 2);
});

test('trajectory: has no mutation methods', () => {
  const tr = new GovernanceTrajectory();
  assert.equal(typeof tr.pop, 'undefined');
  assert.equal(typeof tr.splice, 'undefined');
  assert.equal(typeof tr.delete, 'undefined');
});

// ---------- frozen kernel: fixed invariants ----------

test('kernel: rejects a present-but-invalid token (INV-1)', () => {
  const tr = new GovernanceTrajectory();
  const kernel = new FrozenKernel({ trajectory: tr });
  const fake = { action: 'x', authorizes: () => true };
  const r = kernel.screen({ action: 'x', token: fake }, {});
  assert.equal(r.pass, false);
});

test('kernel: rejects self-mod without staging (INV-2)', () => {
  const tr = new GovernanceTrajectory();
  const kernel = new FrozenKernel({ trajectory: tr });
  const r = kernel.screen({ action: 'self:x', isSelfModification: true, viaStaging: false }, {});
  assert.equal(r.pass, false);
});

test('kernel: rejects power increase without external anchor (INV-5)', () => {
  const tr = new GovernanceTrajectory();
  const kernel = new FrozenKernel({ trajectory: tr });
  const r = kernel.screen({ action: 'p', isPowerIncrease: true, externalAnchorToken: null }, {});
  assert.equal(r.pass, false);
});

test('kernel: rejects EVERYTHING when the trajectory chain is tampered (INV-3)', () => {
  const tr = new GovernanceTrajectory();
  tr.append({ kind: 'admit', origin: 'a' });
  tr.append({ kind: 'gate', action: 'x' });
  // tamper: replace an interior entry's event but keep its old hash → chain no longer verifies
  tr._entries[0] = { ...tr._entries[0], event: { kind: 'gate', action: 'TAMPERED' } };
  const kernel = new FrozenKernel({ trajectory: tr });
  // even a perfectly ordinary request must be refused while the history is corrupt
  const r = kernel.screen({ action: 'tool:calc', kind: 'action' }, {});
  assert.equal(r.pass, false, 'a tampered trajectory fails the kernel screen');
  assert.match(r.reason, /INV-3/);
});

test('pipeline: an unclassifiable self-mod request escalates (sound default = power-increasing)', async () => {
  const { RuleEvaluationPipeline } = await import('../core/constitution/index.js');
  const tr = new GovernanceTrajectory();
  const kernel = new FrozenKernel({ trajectory: tr });
  const pipeline = new RuleEvaluationPipeline({ kernel, recordToTrajectory: (e) => tr.append(e) });
  const ctx = new DecisionContext({ constraints: ConstraintSet.empty() });
  // a self-modifying request with NO action, NO kind, and no conservativeness certificate is
  // unrecognizable — the sound default must treat it as power-increasing and escalate, never permit.
  const v = pipeline.evaluate({ isSelfModification: true, viaStaging: true }, ctx);
  assert.equal(v.permits, false, 'an unclassifiable change does not proceed');
  assert.equal(v.externalAnchorRequired, true, 'it escalates to the external anchor');
});

// ---------- runtime: end-to-end gating ----------

test('runtime: a normal tool call proceeds and gets a token', () => {
  const rt = new ConstitutionRuntime();
  const { ctx } = rt.admit({ origin: 'user' });
  const g = rt.gate({ action: 'tool:calc', requiresToken: true, args: { e: '2+2' } }, ctx);
  assert.equal(g.verdict.permits, true);
  assert.ok(g.token);
  assert.equal(verify(g.token, 'tool:calc', { e: '2+2' }), true);
});

test('runtime: behavior-determining change escalates and (no anchor) halts', () => {
  const rt = new ConstitutionRuntime();
  const { ctx } = rt.admit({ origin: 'user' });
  const g = rt.gate({ action: 'self:update-weights', touchesBehaviorDeterminingState: true }, ctx);
  assert.equal(g.verdict.permits, false);
});

test('runtime: with an external anchor, a power increase can proceed', () => {
  const rt = new ConstitutionRuntime({ externalAnchor: { authorize: () => true } });
  const { ctx } = rt.admit({ origin: 'user' });
  const g = rt.gate({ action: 'self:update-weights', touchesBehaviorDeterminingState: true }, ctx);
  assert.equal(g.verdict.permits, true);
});

test('runtime: inviolable violation halts', () => {
  const rt = new ConstitutionRuntime({
    baseConstraints: new ConstraintSet({ inviolable: new Set(['no-harm']) }),
  });
  const { ctx } = rt.admit({ origin: 'user' });
  const g = rt.gate({ action: 'tool:x', violatesInviolable: 'no-harm' }, ctx);
  assert.equal(g.verdict.permits, false);
});

test('runtime: accumulated exposure blocks a sensitive-read + outbound sequence', () => {
  const rt = new ConstitutionRuntime();
  const { ctx } = rt.admit({ origin: 'user' });
  const a = rt.gate({ action: 'read', exposureDelta: { domain: 'sensitive:location' } }, ctx);
  const b = rt.gate({ action: 'send', exposureDelta: { effector: 'outbound:http' } }, a.ctx);
  assert.equal(b.verdict.permits, false);
});

test('runtime: trajectory stays intact across a session', () => {
  const rt = new ConstitutionRuntime();
  const { ctx } = rt.admit({ origin: 'user' });
  rt.gate({ action: 'tool:calc', requiresToken: true }, ctx);
  assert.equal(rt.attest().chainIntact, true);
});

// ---------- conflict resolution: two tiers ----------

test('conflict: an inviolable party wins without trade-off', () => {
  const events = [];
  const ctx = new DecisionContext();
  const v = resolveConflict(
    { tierA: 'inviolable', tierB: 'weighable', a: 'safety', b: 'speed' },
    ctx,
    (e) => events.push(e),
  );
  assert.equal(v.permits, true); // constrain (inviolable governs), not halt
  assert.equal(events[0].outcome, 'inviolable-wins');
});

test('conflict: two inviolables give an honest declared HALT', () => {
  const events = [];
  const ctx = new DecisionContext();
  const v = resolveConflict(
    { tierA: 'inviolable', tierB: 'inviolable', a: 'x', b: 'y' },
    ctx,
    (e) => events.push(e),
  );
  assert.equal(v.permits, false);
  assert.equal(v.name, 'HALT');
});

test('conflict: a weighable power-conflict escalates to the anchor', () => {
  const events = [];
  const ctx = new DecisionContext();
  const v = resolveConflict(
    { tierA: 'weighable', tierB: 'weighable', a: 'x', b: 'y', involvesPowerIncrease: true },
    ctx,
    (e) => events.push(e),
  );
  assert.equal(v.externalAnchorRequired, true);
});

// ---------- verdict basis ----------

test('verdict: named verdicts derive from the orthogonal basis', () => {
  assert.equal(Verdict.proceed().name, 'PROCEED');
  assert.equal(Verdict.constrain(ConstraintSet.empty()).name, 'CONSTRAIN');
  assert.equal(Verdict.revise('S2').name, 'REVISE');
  assert.equal(Verdict.halt().name, 'HALT');
  assert.equal(Verdict.escalate().name, 'ESCALATE');
});

// ---------- conservativeness certificate checker (W-1a / W-1a-ii) ----------

import { checkCertificate, registerTransformation } from '../core/constitution/index.js';

test('certificate: a valid derivation covering the closure is conservative', () => {
  const cert = {
    steps: [
      { transform: 'cache-memoize', site: 'fn:score', pure: true, covers: ['s:cache'] },
      { transform: 'dead-branch-elim', site: 'fn:route', branchProvablyUnreachable: true, covers: ['s:route'] },
    ],
    effectClosure: ['s:cache', 's:route'],
  };
  assert.equal(checkCertificate(cert).conservative, true);
});

test('certificate: an unapproved transformation is rejected', () => {
  const cert = { steps: [{ transform: 'rewrite-weights', site: 'x' }], effectClosure: ['x'] };
  assert.equal(checkCertificate(cert).conservative, false);
});

test('certificate: unmet preconditions are rejected', () => {
  const cert = { steps: [{ transform: 'cache-memoize', site: 'x', pure: false, covers: ['x'] }], effectClosure: ['x'] };
  assert.equal(checkCertificate(cert).conservative, false);
});

test('certificate: incomplete coverage is rejected (W-1a-ii)', () => {
  const cert = { steps: [{ transform: 'cache-memoize', site: 'a', pure: true, covers: ['a'] }], effectClosure: ['a', 'b'] };
  const r = checkCertificate(cert);
  assert.equal(r.conservative, false);
  assert.match(r.reason, /cover/);
});

test('certificate: a behavior-determining change is never certifiable (-TERMINATION)', () => {
  const cert = {
    steps: [{ transform: 'cache-memoize', site: 'w', pure: true, covers: ['w'] }],
    effectClosure: ['w'],
    touchesBehaviorDeterminingState: true,
  };
  assert.equal(checkCertificate(cert).conservative, false);
});

test('certificate: extending the catalog is an external-anchor act, not in-system', () => {
  assert.throws(() => registerTransformation(), /external-anchor/);
});

test('pipeline: a conservative self-mod WITH a valid certificate proceeds autonomously', () => {
  const rt = new ConstitutionRuntime();
  const { ctx } = rt.admit({ origin: 'test' });
  const cert = { steps: [{ transform: 'cache-memoize', site: 'a', pure: true, covers: ['a'] }], effectClosure: ['a'] };
  const g = rt.gate({ action: 'self:optimize', classification: 'conservative', conservativenessCertificate: cert }, ctx);
  assert.equal(g.verdict.permits, true);
});

test('pipeline: a conservative CLAIM without a certificate is not trusted', () => {
  const rt = new ConstitutionRuntime();
  const { ctx } = rt.admit({ origin: 'test' });
  const g = rt.gate({ action: 'self:optimize', classification: 'conservative' }, ctx);
  assert.equal(g.verdict.permits, false);
});

// ---------- cross-partition information flow (PARTITION §4) ----------

import { PartitionFlowController, FLOW_POLICY, InProcessAnchor, fromLegacyAuthorize } from '../core/constitution/index.js';

test('partition flow: fluid→frozen with no policy is forbidden (safe default)', () => {
  const fc = new PartitionFlowController({ partitionTags: { p: 'FROZEN', l: 'FLUID' } });
  const r = fc.evaluate({ fromRegion: 'l', toRegion: 'p' });
  assert.equal(r.allow, false);
  assert.equal(r.policy, FLOW_POLICY.FORBID);
});

test('partition flow: fluid→frozen ANCHOR requires anchor approval', () => {
  const fc = new PartitionFlowController({
    partitionTags: { p: 'FROZEN', l: 'FLUID' },
    flowPolicies: { 'l->p': FLOW_POLICY.ANCHOR },
  });
  assert.equal(fc.evaluate({ fromRegion: 'l', toRegion: 'p', anchorApproved: false }).allow, false);
  assert.equal(fc.evaluate({ fromRegion: 'l', toRegion: 'p', anchorApproved: true }).allow, true);
});

test('partition flow: non fluid→frozen flows carry no cross-partition risk', () => {
  const fc = new PartitionFlowController({ partitionTags: { p: 'FROZEN', q: 'FROZEN', l: 'FLUID' } });
  assert.equal(fc.evaluate({ fromRegion: 'p', toRegion: 'q' }).allow, true); // frozen→frozen
  assert.equal(fc.evaluate({ fromRegion: 'p', toRegion: 'l' }).allow, true); // frozen→fluid
  assert.equal(fc.evaluate({ fromRegion: 'l', toRegion: 'l' }).allow, true); // fluid→fluid
});

// ---------- external anchor: attest (W-3) + authorize (W-1), kept separate ----------

test('anchor: attest compares to the genuine reference (tamper-evident)', () => {
  const a = new InProcessAnchor({ genuineMeasurement: 'ref-1' });
  assert.equal(a.attest('ref-1').genuine, true);
  assert.equal(a.attest('tampered').genuine, false);
});

test('anchor: authorize is a separate active judgment', () => {
  const a = new InProcessAnchor({ genuineMeasurement: 'ref-1', authorizePolicy: (r) => r.action === 'ok' });
  assert.equal(a.authorize({ action: 'ok' }).authorized, true);
  assert.equal(a.authorize({ action: 'no' }).authorized, false);
});

test('anchor: attest and authorize are distinct methods (not merged)', () => {
  const a = new InProcessAnchor({ genuineMeasurement: 'ref-1' });
  assert.notEqual(a.attest, a.authorize);
});

test('anchor: a throwing authorize policy fails closed', () => {
  const a = new InProcessAnchor({ genuineMeasurement: 'r', authorizePolicy: () => { throw new Error('x'); } });
  assert.equal(a.authorize({}).authorized, false);
});

test('anchor: legacy adapter authorizes but honestly cannot attest', () => {
  const a = fromLegacyAuthorize((r) => r.ok === true);
  assert.equal(a.authorize({ ok: true }).authorized, true);
  assert.equal(a.attest('anything').genuine, false); // no reference → honestly non-genuine
});

test('runtime: accepts a formal anchor and integrates attestation', () => {
  const anchor = new InProcessAnchor({ genuineMeasurement: 'k1', authorizePolicy: (r) => r.action === 'self:ok' });
  const rt = new ConstitutionRuntime({ externalAnchor: anchor });
  const { ctx } = rt.admit({ origin: 't' });
  const g = rt.gate({ action: 'self:ok', touchesBehaviorDeterminingState: true }, ctx);
  assert.equal(g.verdict.permits, true);
  assert.equal(rt.attest('k1').anchorGenuine, true);
  assert.equal(rt.attest('bad').anchorGenuine, false);
});

test('runtime: still accepts the legacy boolean anchor stub', () => {
  const rt = new ConstitutionRuntime({ externalAnchor: { authorize: () => true } });
  const { ctx } = rt.admit({ origin: 't' });
  const g = rt.gate({ action: 'self:x', touchesBehaviorDeterminingState: true }, ctx);
  assert.equal(g.verdict.permits, true);
});
