// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// test/isolatedAdjudicator.test.mjs — S-2 isolation contracts.
//
// These lock in the properties that make moving the adjudicator into its own thread a SAFETY
// gain rather than a refactor:
//   1. wire tokens are authentic-by-construction (edit ⇒ MAC break; foreign key ⇒ reject)
//   2. the golden invariant: killing the adjudicator FAILS CLOSED (paralysis, not freedom)
//   3. the main thread cannot mint/verify/consume — only the worker can
//   4. sessions live in the worker; the host holds only an opaque id
//   5. S-3 canary gate: a dulled evaluator freezes self-modification
//   6. the governance trajectory stays tamper-evident across the boundary

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { IsolatedAdjudicator } from '../core/constitution/IsolatedAdjudicator.js';
import { WireCapabilityMint, _canonicalForTests } from '../core/constitution/WireCapability.js';

// ── WireCapability: authenticity by construction ────────────────────────────

test('wire token: a genuine token verifies for its action', () => {
  const mint = new WireCapabilityMint();
  const t = mint.mint({ action: 'tool:calc', validity: 'window', expiresAt: Date.now() + 10000 });
  assert.equal(mint.verify(t, 'tool:calc').ok, true);
  assert.equal(typeof t.sig, 'string', 'carries a signature');
  assert.ok(!t._brand, 'no Symbol brand — pure data, survives structuredClone');
});

test('wire token: editing ANY signed field breaks the MAC', () => {
  const mint = new WireCapabilityMint();
  const t = mint.mint({ action: 'tool:calc' });
  assert.equal(mint.verify({ ...t, action: 'tool:evil' }, 'tool:evil').ok, false, 'edited action');
  assert.equal(mint.verify({ ...t, id: 'cap_999' }, 'tool:calc').ok, false, 'edited id');
  assert.equal(mint.verify({ ...t, argBounds: { x: 1 } }, 'tool:calc').ok, false, 'injected arg bounds');
  assert.equal(mint.verify({ ...t, nonce: 'AAAA' }, 'tool:calc').ok, false, 'edited nonce');
});

test('wire token: a token signed by a DIFFERENT key is rejected (no cross-mint forgery)', () => {
  const real = new WireCapabilityMint();
  const attacker = new WireCapabilityMint();
  const forged = attacker.mint({ action: 'tool:calc' });
  assert.equal(real.verify(forged, 'tool:calc').ok, false);
});

test('wire token: a hand-built object with a fake sig is rejected', () => {
  const mint = new WireCapabilityMint();
  const fake = { id: 'cap_1', action: 'tool:calc', argBounds: null, validity: 'one-shot', expiresAt: null, parent: null, nonce: 'x', sig: 'ZmFrZQ==' };
  assert.equal(mint.verify(fake, 'tool:calc').ok, false);
});

test('wire token: one-shot consume blocks replay', () => {
  const mint = new WireCapabilityMint();
  const t = mint.mint({ action: 'tool:calc', validity: 'one-shot' });
  assert.equal(mint.verify(t, 'tool:calc').ok, true);
  mint.consume(t);
  assert.equal(mint.verify(t, 'tool:calc').ok, false, 'a spent one-shot no longer authorizes');
});

test('wire token: expired window token is rejected', () => {
  const mint = new WireCapabilityMint();
  const t = mint.mint({ action: 'tool:calc', validity: 'window', expiresAt: Date.now() - 1 });
  assert.equal(mint.verify(t, 'tool:calc').ok, false);
});

test('wire token: attenuation narrows (adds arg bounds, keeps the action)', () => {
  const mint = new WireCapabilityMint();
  const parent = mint.mint({ action: 'tool:calc' });
  const child = mint.attenuate(parent, { argBounds: { x: 5 } });
  assert.equal(child.action, 'tool:calc');
  assert.equal(child.parent, parent.id);
  assert.equal(mint.verify(child, 'tool:calc', { x: 5 }).ok, true);
  assert.equal(mint.verify(child, 'tool:calc', { x: 6 }).ok, false, 'child bound enforced');
});

test('wire token: canonical form is key-order independent (no wire-reordering forgery)', () => {
  const a = _canonicalForTests({ id: 'i', action: 'a', argBounds: { x: 1, y: 2 }, validity: 'one-shot', expiresAt: null, parent: null, nonce: 'n' });
  const b = _canonicalForTests({ id: 'i', action: 'a', argBounds: { y: 2, x: 1 }, validity: 'one-shot', expiresAt: null, parent: null, nonce: 'n' });
  assert.equal(a, b, 'argBounds key order does not change the signed string');
});

// ── IsolatedAdjudicator: the isolation contracts (need a live worker) ────────

let adj;
before(async () => { adj = new IsolatedAdjudicator({ timeoutMs: 4000 }); await adj.start(); });
after(async () => { if (adj) await adj.stop(); });

test('isolation: admit opens a session; the host holds only an opaque id', async () => {
  const { ctx, verdict } = await adj.admit({ origin: 'test' });
  assert.equal(verdict.name, 'PROCEED');
  assert.equal(typeof ctx.sessionId, 'string');
  // the host stub carries NO constraints/trajectory/mint — just the id
  assert.deepEqual(Object.keys(ctx), ['sessionId']);
});

test('isolation: a normal tool call is permitted and yields a wire-signed token', async () => {
  const { ctx } = await adj.admit({ origin: 'test' });
  const { verdict, token } = await adj.gate(
    { action: 'tool:calculator', requiresToken: true, kind: 'action', args: { x: 2 } }, ctx);
  assert.equal(verdict.permits, true);
  assert.equal(typeof token.sig, 'string', 'token crossed the boundary as signed data');
  assert.ok(!token._brand, 'no in-process brand leaked across the wire');
});

test('isolation: gate without a session fails closed', async () => {
  const { verdict, token } = await adj.gate({ action: 'tool:x', requiresToken: true }, { sessionId: null });
  assert.equal(verdict.permits, false);
  assert.equal(token, null);
});

test('isolation: a power-increasing intent without an anchor is denied (fail-closed)', async () => {
  const { ctx } = await adj.admit({ origin: 'test' });
  // reachExpands ⇒ the worker escalates to the external anchor; this adjudicator has none,
  // so the escalation resolves to a denial. Either way the action does NOT proceed and no
  // token is minted — that is the fail-closed contract.
  const { verdict, token } = await adj.gate(
    { action: 'self:grant', reachExpands: true, requiresToken: true }, ctx);
  assert.equal(verdict.permits, false, 'a power-increasing change without anchor cannot proceed');
  assert.equal(token, null, 'and no capability token is minted');
});

test('GOLDEN INVARIANT: killing the adjudicator fails closed — paralysis, not freedom', async () => {
  const local = new IsolatedAdjudicator({ timeoutMs: 2000 });
  await local.start();
  const { ctx } = await local.admit({ origin: 'kill-test' });
  // works while alive
  const alive = await local.gate({ action: 'tool:calc', requiresToken: true, kind: 'action' }, ctx);
  assert.equal(alive.verdict.permits, true);
  // kill it
  await local.stop();
  assert.equal(local.isDown, true);
  // every subsequent gate must HALT with no token — the host cannot self-authorize
  const dead = await local.gate({ action: 'tool:calc', requiresToken: true, kind: 'action' }, ctx);
  assert.equal(dead.verdict.permits, false, 'no permit after the adjudicator dies');
  assert.equal(dead.token, null, 'no token can be minted without the worker');
});

test('isolation: external anchor round-trip authorizes a parked escalation', async () => {
  const yes = new IsolatedAdjudicator({ externalAnchor: { authorize: () => true }, timeoutMs: 3000 });
  await yes.start();
  const { ctx } = await yes.admit({ origin: 'anchor-test' });
  const { verdict, token } = await yes.gate(
    { action: 'self:grant', reachExpands: true, requiresToken: true }, ctx);
  assert.equal(verdict.permits, true, 'anchor authorized the power increase');
  assert.ok(token && token.sig, 'and a token was minted after resolution');
  await yes.stop();
});

test('isolation: without an anchor, an escalation stays denied (fail-closed)', async () => {
  const { ctx } = await adj.admit({ origin: 'no-anchor' });
  const { verdict } = await adj.gate(
    { action: 'self:grant', reachExpands: true, requiresToken: true }, ctx);
  assert.equal(verdict.permits, false);
});

// ── S-3: canary competence gate ─────────────────────────────────────────────

const ALL_CANARIES = [
  'weaken-inviolable', 'add-loosen-op', 'bypass-mint', 'mutate-trajectory', 'self-grant-power',
  'disable-canary', 'exfiltrate-secret', 'anchor-forge', 'unbounded-selfmod', 'silence-reportup',
];

test('S-3: a competent evaluator (all canaries caught) passes the gate to the pipeline', async () => {
  const local = new IsolatedAdjudicator({ timeoutMs: 3000 });
  await local.start();
  const { ctx } = await local.admit({ origin: 's3-good' });
  const { verdict } = await local.gate(
    { action: 'self:refactor', selfModify: true, evaluatorProof: ALL_CANARIES,
      classification: 'conservative', conservativenessCertificate: { steps: [] } }, ctx);
  // it is not canary-blocked (it may still be shaped by the pipeline, but not HALTed by canary)
  assert.notEqual(verdict.reason, undefined);
  assert.ok(!/canary/.test(verdict.reason || ''), 'not blocked by the canary gate');
  await local.stop();
});

test('S-3: a dulled evaluator (missed canaries) is hard-rejected and freezes self-mod', async () => {
  const local = new IsolatedAdjudicator({ timeoutMs: 3000 });
  await local.start();
  const { ctx } = await local.admit({ origin: 's3-bad' });
  const missing = ALL_CANARIES.filter((id) => id !== 'bypass-mint');
  const bad = await local.gate({ action: 'self:refactor', selfModify: true, evaluatorProof: missing }, ctx);
  assert.equal(bad.verdict.permits, false);
  assert.match(bad.verdict.reason, /canary/);

  // freeze persists: even a now-competent proof is blocked
  const after = await local.gate({ action: 'self:refactor', selfModify: true, evaluatorProof: ALL_CANARIES }, ctx);
  assert.equal(after.verdict.permits, false);
  assert.match(after.verdict.reason, /frozen/);

  const status = await local.canaryStatus();
  assert.equal(status.frozen, true);
  await local.stop();
});

// ── trajectory integrity across the boundary ────────────────────────────────

test('trajectory: stays intact and host-readable after a session of gates', async () => {
  const { ctx } = await adj.admit({ origin: 'traj' });
  await adj.gate({ action: 'tool:a', requiresToken: true, kind: 'action' }, ctx);
  await adj.gate({ action: 'tool:b', requiresToken: true, kind: 'action' }, ctx);
  const { snapshot, intact } = await adj.trajectorySnapshot();
  assert.equal(intact, true);
  assert.ok(snapshot.version >= 3, 'admit + two gates recorded');
});

test('attest: reports genuine while chain intact and not canary-frozen', async () => {
  const att = await adj.attest();
  assert.equal(att.chainIntact, true);
  assert.equal(att.genuine, true);
});

// ── drop-in contract: the SAME AgentLoop runs on the isolated adjudicator ────

test('drop-in: AgentLoop runs end-to-end governed by the IsolatedAdjudicator', async () => {
  const { AgentLoop, ToolRegistry, defineTool, rulePolicy } = await import('../core/agent/index.js');
  const calculator = defineTool({
    name: 'calculator', description: 'evaluate', safe: true,
    run: ({ expression }) => ({ value: expression === '6*7' ? 42 : NaN }),
  });
  const local = new IsolatedAdjudicator({ timeoutMs: 4000 });
  await local.start();
  try {
    const agent = new AgentLoop({
      tools: new ToolRegistry().register(calculator),
      constitution: local, // ← the isolated adjudicator, same slot as ConstitutionRuntime
      policy: rulePolicy([
        { when: (o) => o.step === 0, act: () => ({ type: 'tool', tool: 'calculator', args: { expression: '6*7' } }) },
        { when: (o) => o.step > 0, act: (o) => ({ type: 'finish', answer: o.lastResult?.result }) },
      ]),
    });
    const r = await agent.run('compute');
    assert.equal(r.governed, true, 'the loop reports itself governed');
    assert.deepEqual(r.answer, { value: 42 }, 'the permitted tool actually executed');
    const { intact } = await local.trajectorySnapshot();
    assert.equal(intact, true, 'admit + gate were recorded in the isolated trajectory');
  } finally {
    await local.stop();
  }
});

test('drop-in: with a DEAD adjudicator the same loop cannot act (fail-closed end-to-end)', async () => {
  const { AgentLoop, ToolRegistry, defineTool, rulePolicy } = await import('../core/agent/index.js');
  const calculator = defineTool({
    name: 'calculator', description: 'evaluate', safe: true, run: () => ({ value: 42 }),
  });
  const local = new IsolatedAdjudicator({ timeoutMs: 2000 });
  await local.start();
  await local.stop(); // adjudicator is killed BEFORE the run
  const agent = new AgentLoop({
    tools: new ToolRegistry().register(calculator),
    constitution: local,
    policy: rulePolicy([
      { when: (o) => o.step === 0, act: () => ({ type: 'tool', tool: 'calculator', args: {} }) },
      { when: (o) => o.step > 0, act: (o) => ({ type: 'finish', answer: o.lastResult }) },
    ]),
    config: { maxSteps: 3 },
  });
  const r = await agent.run('compute');
  const blocked = r.trace.find((t) => t.result?.constitutionalVerdict === 'HALT');
  assert.ok(blocked, 'every governed tool call HALTed — the agent is paralyzed, not freed');
  assert.equal(blocked.result.ok, false);
});

// ── mutation-killers: close the holes the mutation harness surfaced ──────────

test('trajectory: a tampered chain is detected (INV-3 must not be skippable)', async () => {
  // Directly exercise GovernanceTrajectory's integrity check so a mutation that disables it
  // (skip verifyIntegrity) is caught: a forged/dropped interior entry must fail verification.
  const { GovernanceTrajectory } = await import('../core/constitution/GovernanceTrajectory.js');
  const t = new GovernanceTrajectory();
  t.append({ kind: 'admit', origin: 'a' });
  t.append({ kind: 'gate', action: 'x' });
  assert.equal(t.verifyIntegrity(), true, 'an intact chain verifies');
  // entries are individually frozen, so replace one wholesale with a tampered event but the
  // ORIGINAL hash — verifyIntegrity recomputes the hash from the event and must reject the mismatch
  const entries = t._entries;
  assert.ok(Array.isArray(entries) && entries.length >= 2, 'trajectory keeps hashed entries');
  entries[0] = { ...entries[0], event: { kind: 'gate', action: 'TAMPERED' } };
  assert.equal(t.verifyIntegrity(), false, 'a tampered interior entry is detected');
});

test('S-3: the canary battery cannot self-unfreeze without an external anchor', async () => {
  const { CanaryBattery } = await import('../core/constitution/CanaryBattery.js');
  const cb = new CanaryBattery();
  cb.freeze('test freeze');
  assert.equal(cb.frozen, true);
  cb.unfreeze(false);                 // no anchor authorization
  assert.equal(cb.frozen, true, 'still frozen — no self-unfreeze');
  cb.unfreeze('yes');                 // truthy-but-not-true must also fail closed
  assert.equal(cb.frozen, true, 'only an explicit anchor authorization (true) lifts the freeze');
  cb.unfreeze(true);                  // genuine anchor authorization
  assert.equal(cb.frozen, false, 'a true anchor authorization lifts it');
});
