// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// test/calibrationLedger.test.mjs — S-1 oracle-bounding contracts.
//
// The ledger converts "prediction is trusted" into "prediction is trusted only where its
// track record is measured and good." These tests lock in that fail-closed behavior and the
// tamper-evidence that stops the agent from fabricating its own calibration.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CalibrationLedger } from '../core/world/CalibrationLedger.js';

test('ledger: an unknown action class is NOT calibrated (no track record ⇒ fail closed)', () => {
  const l = new CalibrationLedger();
  const t = l.trust('irreversible:wire-transfer');
  assert.equal(t.calibrated, false);
  assert.match(t.reason, /no track record/);
});

test('ledger: too few samples is NOT calibrated even if every prediction was perfect', () => {
  const l = new CalibrationLedger({ minSamples: 8, calibratedThreshold: 0.7 });
  for (let i = 0; i < 5; i++) l.record('trade', { error: 0 }); // perfect but only 5 samples
  const t = l.trust('trade');
  assert.equal(t.calibrated, false);
  assert.match(t.reason, /samples/);
  assert.ok(t.score > 0.9, 'score reflects the good record, but sample count still gates');
});

test('ledger: a well-sampled, accurate class becomes calibrated', () => {
  const l = new CalibrationLedger({ minSamples: 8, calibratedThreshold: 0.7 });
  for (let i = 0; i < 10; i++) l.record('trade', { error: 0.1 }); // 90% accurate, 10 samples
  const t = l.trust('trade');
  assert.equal(t.calibrated, true);
  assert.ok(t.score >= 0.7);
  assert.equal(t.n, 10);
});

test('ledger: a well-sampled but INACCURATE class stays uncalibrated', () => {
  const l = new CalibrationLedger({ minSamples: 8, calibratedThreshold: 0.7 });
  for (let i = 0; i < 12; i++) l.record('trade', { error: 0.6 }); // 40% accurate
  const t = l.trust('trade');
  assert.equal(t.calibrated, false);
  assert.match(t.reason, /below threshold/);
});

test('ledger: predicted/actual/scale is normalized to a bounded error', () => {
  const l = new CalibrationLedger({ minSamples: 3, calibratedThreshold: 0.7 });
  // predicted 100, actual 105, scale 100 ⇒ error 0.05 (95% accurate)
  for (let i = 0; i < 4; i++) l.record('price', { predicted: 100, actual: 105, scale: 100 });
  const t = l.trust('price');
  assert.equal(t.calibrated, true);
  assert.ok(t.score > 0.9);
});

test('ledger: an outcome with no usable signal counts as maximal error (unmeasured ≠ accurate)', () => {
  const l = new CalibrationLedger({ minSamples: 1, calibratedThreshold: 0.5 });
  l.record('mystery', {}); // no error, no predicted/actual
  const t = l.trust('mystery');
  assert.equal(t.calibrated, false, 'a signal-free record is treated as a miss');
  assert.equal(t.score, 0);
});

test('ledger: the record chain is tamper-evident', () => {
  const l = new CalibrationLedger();
  for (let i = 0; i < 5; i++) l.record('trade', { error: 0.1 });
  assert.equal(l.verifyIntegrity(), true);
  // forge one record's error to fake better accuracy
  l._entries[2] = { ...l._entries[2], error: 0 };
  assert.equal(l.verifyIntegrity(), false, 'a forged accuracy record breaks the chain');
});

test('ledger: a broken chain makes EVERY class read as uncalibrated (fail closed)', () => {
  const l = new CalibrationLedger({ minSamples: 2, calibratedThreshold: 0.5 });
  for (let i = 0; i < 6; i++) l.record('trade', { error: 0.05 });
  assert.equal(l.trust('trade').calibrated, true, 'calibrated while intact');
  l._entries[1] = { ...l._entries[1], error: 0 }; // tamper
  const t = l.trust('trade');
  assert.equal(t.calibrated, false, 'tampering revokes all calibration');
  assert.match(t.reason, /integrity/);
});

test('ledger: report() summarizes per-class calibration', () => {
  const l = new CalibrationLedger({ minSamples: 3, calibratedThreshold: 0.7 });
  for (let i = 0; i < 4; i++) l.record('good', { error: 0.1 });
  for (let i = 0; i < 4; i++) l.record('bad', { error: 0.8 });
  const r = l.report();
  assert.equal(r.good.calibrated, true);
  assert.equal(r.bad.calibrated, false);
  assert.equal(r.good.n, 4);
});
