// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// test/confidence.test.mjs — tests for the confidence estimator.
//
//   node --test test/confidence.test.mjs
//   npm run test:confidence

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { estimateConfidence } from '../core/reflection/confidence.js';
import { EngineRegistry } from '../core/mesh/EngineRegistry.js';
import { MeshRouter } from '../core/mesh/MeshRouter.js';

function meshWith(engines) {
  const reg = new EngineRegistry();
  for (const e of engines) reg.register(e.id, e);
  return new MeshRouter(reg);
}

// ── a clear, strong winner → high confidence ──────────────────────────────
test('confidence: a strong uncontested winner scores high', async () => {
  const mesh = meshWith([
    { id: 'finance', canHandle: (t) => ({ canHandle: /stock/.test(t), confidence: 0.95 }), run: async () => ({}) },
    { id: 'coding', canHandle: (t) => ({ canHandle: /code/.test(t), confidence: 0.2 }), run: async () => ({}) },
  ]);
  const c = estimateConfidence(await mesh.route('is this stock good?'));
  assert.equal(c.band, 'high');
  assert.ok(c.percent >= 70, `expected high percent, got ${c.percent}`);
  assert.ok(c.score >= 0 && c.score <= 1, 'score must be within [0,1]');
});

// ── two near-tied contenders → lower confidence ───────────────────────────
test('confidence: closely contested engines score lower', async () => {
  const mesh = meshWith([
    { id: 'a', canHandle: () => ({ canHandle: true, confidence: 0.55 }), run: async () => ({}) },
    { id: 'b', canHandle: () => ({ canHandle: true, confidence: 0.52 }), run: async () => ({}) },
  ]);
  const c = estimateConfidence(await mesh.route('ambiguous'));
  assert.ok(c.band !== 'high', 'a near-tie should not be high confidence');
  assert.ok(c.reasons.some((r) => /contested/i.test(r)), 'should explain the contention');
});

// ── shape & bounds ────────────────────────────────────────────────────────
test('confidence: always returns a well-formed, bounded result', async () => {
  const mesh = meshWith([
    { id: 'g', canHandle: () => ({ canHandle: true, confidence: 0.7 }), run: async () => ({}) },
  ]);
  const c = estimateConfidence(await mesh.route('anything'));
  assert.ok(['low', 'medium', 'high'].includes(c.band));
  assert.equal(c.percent, Math.round(c.score * 100));
  assert.ok(Array.isArray(c.reasons) && c.reasons.length >= 1);
  assert.ok(c.signals && typeof c.signals.topConfidence === 'number');
});

// ── held execution caps confidence ────────────────────────────────────────
test('confidence: a held (self-braked) response is capped low', () => {
  // simulate a routed result that was held for self-review
  const held = {
    held: true,
    candidates: [{ id: 'x', canHandle: true, confidence: 0.9 }],
    correction: { uncertainty: 0.8 },
  };
  const c = estimateConfidence(held);
  assert.ok(c.score <= 0.35, 'held responses must not report high confidence');
  assert.ok(c.reasons.some((r) => /held|review/i.test(r)));
});

// ── uncertainty signal is folded in when present ──────────────────────────
test('confidence: high self-correction uncertainty lowers the score', () => {
  const base = { candidates: [{ id: 'x', canHandle: true, confidence: 0.8 }] };
  const certain = estimateConfidence({ ...base, correction: { uncertainty: 0.1 } });
  const unsure = estimateConfidence({ ...base, correction: { uncertainty: 0.9 } });
  assert.ok(certain.score > unsure.score, 'lower uncertainty should mean higher confidence');
});

// ── language option ───────────────────────────────────────────────────────
test('confidence: reasons localize to Korean with lang:ko', async () => {
  const mesh = meshWith([
    { id: 'finance', canHandle: () => ({ canHandle: true, confidence: 0.95 }), run: async () => ({}) },
  ]);
  const c = estimateConfidence(await mesh.route('stock'), { lang: 'ko' });
  assert.ok(c.reasons.some((r) => /[가-힣]/.test(r)), 'Korean reasons expected');
});

// ── degenerate input never throws ─────────────────────────────────────────
test('confidence: empty / missing routing data is handled gracefully', () => {
  assert.doesNotThrow(() => estimateConfidence({}));
  assert.doesNotThrow(() => estimateConfidence());
  const c = estimateConfidence({ candidates: [] });
  assert.equal(c.band, 'low', 'no handlers → low confidence');
});
