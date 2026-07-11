// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// test/calibrationGate.test.mjs — S-1 wired into the live gate (not beside it).
//
// The contract: an irreversible action that justifies its safety by an oracle prediction may
// only rely on that oracle for an action CLASS with a measured, well-calibrated, tamper-intact
// track record. No record, too few samples, a poor score, or a broken ledger chain ⇒ the oracle
// is not trusted for an irreversible bet ⇒ escalate to the external anchor (fail-closed without
// one). A class earns trust through recorded outcomes and can rely on the oracle thereafter.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { IsolatedAdjudicator } from '../core/constitution/IsolatedAdjudicator.js';

const CAL = { minSamples: 3, calibratedThreshold: 0.7 };

async function boot(opts = {}) {
  const adj = new IsolatedAdjudicator({ calibration: CAL, timeoutMs: 4000, ...opts });
  await adj.start();
  const { ctx } = await adj.admit({ origin: 's1-test' });
  return { adj, ctx };
}

const oracleIntent = (actionClass) => ({
  action: actionClass, kind: 'action', irreversible: true,
  oracleReliance: { actionClass }, requiresToken: true,
});

test('S-1: an irreversible action on an UNCALIBRATED class escalates (denied without an anchor)', async () => {
  const { adj, ctx } = await boot(); // no anchor
  const { verdict, token } = await adj.gate(oracleIntent('db:migrate'), ctx);
  assert.equal(verdict.permits, false);
  assert.equal(token, null);
  await adj.stop();
});

test('S-1: after enough good outcomes the class is calibrated and the action PROCEEDS with a token', async () => {
  const { adj, ctx } = await boot();
  for (let i = 0; i < 4; i++) {
    const r = await adj.recordOutcome('db:migrate', { error: 0.05 });
    assert.equal(r.ok, true);
  }
  const { verdict, token } = await adj.gate(oracleIntent('db:migrate'), ctx);
  assert.equal(verdict.permits, true);
  assert.equal(verdict.name, 'PROCEED');
  assert.ok(token && token.sig, 'a real capability token is minted for the now-trusted reliance');
  await adj.stop();
});

test('S-1: trust is PER-CLASS — a well-calibrated class does not vouch for a different one', async () => {
  const { adj, ctx } = await boot();
  for (let i = 0; i < 5; i++) await adj.recordOutcome('db:migrate', { error: 0.02 });
  // a different, unrecorded class still escalates despite db:migrate's spotless history
  const { verdict } = await adj.gate(oracleIntent('fs:wipe'), ctx);
  assert.equal(verdict.permits, false, 'no cross-class trust leakage');
  await adj.stop();
});

test('S-1: too FEW samples is not yet trustworthy (fails closed until minSamples)', async () => {
  const { adj, ctx } = await boot(); // minSamples = 3
  await adj.recordOutcome('svc:deploy', { error: 0.01 });
  await adj.recordOutcome('svc:deploy', { error: 0.01 }); // only 2 < 3
  const { verdict } = await adj.gate(oracleIntent('svc:deploy'), ctx);
  assert.equal(verdict.permits, false, '2/3 samples is not enough to bet irreversibly');
  await adj.stop();
});

test('S-1: a POORLY-calibrated class (high error) is refused even with plenty of samples', async () => {
  const { adj, ctx } = await boot();
  for (let i = 0; i < 8; i++) await adj.recordOutcome('ml:autotune', { error: 0.6 }); // score 0.4 < 0.7
  const { verdict } = await adj.gate(oracleIntent('ml:autotune'), ctx);
  assert.equal(verdict.permits, false, 'being consistently wrong does not earn irreversible trust');
  const att = await adj.attest();
  assert.equal(att.calibration['ml:autotune'].calibrated, false);
  await adj.stop();
});

test('S-1: a calibrated class that DEGRADES loses trust (the loop runs both ways)', async () => {
  const { adj, ctx } = await boot();
  for (let i = 0; i < 5; i++) await adj.recordOutcome('cache:evict', { error: 0.02 });
  assert.equal((await adj.gate(oracleIntent('cache:evict'), ctx)).verdict.permits, true, 'earns trust');
  // now the world model starts being wrong about this class
  for (let i = 0; i < 20; i++) await adj.recordOutcome('cache:evict', { error: 0.95 });
  assert.equal((await adj.gate(oracleIntent('cache:evict'), ctx)).verdict.permits, false, 'and loses it');
  await adj.stop();
});

test('S-1: an anchor CAN authorize an uncalibrated irreversible action (escalation, not a hard wall)', async () => {
  const anchor = { authorize: () => true }; // a human that says yes
  const { adj, ctx } = await boot({ externalAnchor: anchor });
  const { verdict, token } = await adj.gate(oracleIntent('db:migrate'), ctx);
  assert.equal(verdict.permits, true, 'the anchor is the correct fallback authority for an untrusted bet');
  assert.ok(token && token.sig);
  await adj.stop();
});

test('S-1: reversible actions are unaffected — the gate only fires for irreversible+oracleReliance', async () => {
  const { adj, ctx } = await boot();
  // no irreversible flag ⇒ the calibration gate is not consulted at all
  const { verdict } = await adj.gate({ action: 'tool:calc', kind: 'action', requiresToken: true }, ctx);
  assert.equal(verdict.permits, true);
  await adj.stop();
});

test('S-1: the calibration ledger is tamper-evident and reported in attestation', async () => {
  const { adj } = await boot();
  for (let i = 0; i < 3; i++) await adj.recordOutcome('db:migrate', { error: 0.1 });
  const att = await adj.attest();
  assert.equal(att.calibrationIntact, true);
  assert.ok(att.calibration['db:migrate'].n === 3);
  await adj.stop();
});

test('S-1: predicted/actual/scale outcomes normalize into the same trust judgment', async () => {
  const { adj, ctx } = await boot();
  // |predicted-actual|/scale = |10-11|/100 = 0.01 error, ×5 → well calibrated
  for (let i = 0; i < 5; i++) await adj.recordOutcome('sim:step', { predicted: 10, actual: 11, scale: 100 });
  const { verdict } = await adj.gate(oracleIntent('sim:step'), ctx);
  assert.equal(verdict.permits, true, 'scalar-error and predicted/actual paths agree');
  await adj.stop();
});
