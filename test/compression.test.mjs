// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// test/compression.test.mjs — tests for episodic Memory Compression.
//
// Verifies the AGI-style behavior: recent turns stay verbatim, older turns are
// summarized (not just dropped) so the agent keeps the gist of long histories.
//
//   node --test test/compression.test.mjs
//   npm run test:compression

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { EpisodeMemory } from '../core/memory/index.js';
import { compressTurns } from '../core/memory/MemoryCompressor.js';

// ── the compressor itself ─────────────────────────────────────────────────
test('compressor: extracts keywords, roles, and a gist from turns', () => {
  const turns = [];
  for (let i = 0; i < 40; i++) {
    turns.push({ role: i % 2 ? 'assistant' : 'user', text: `samsung stock analysis ${i}`, t: Date.now() + i });
  }
  const s = compressTurns(turns);
  assert.equal(s.kind, 'summary');
  assert.equal(s.count, 40);
  assert.equal(s.roles.user, 20);
  assert.equal(s.roles.assistant, 20);
  assert.ok(s.keywords.includes('samsung'), 'dominant keyword should surface');
  assert.ok(s.gist.length > 0);
});

test('compressor: extracts Korean keywords too (multilingual)', () => {
  const turns = Array.from({ length: 20 }, (_, i) => ({ role: 'user', text: `삼성 주가 분석 ${i}`, t: Date.now() }));
  const s = compressTurns(turns);
  assert.ok(s.keywords.some((k) => /[가-힣]/.test(k)), 'should pick up Hangul keywords');
});

test('compressor: empty input returns null (no crash)', () => {
  assert.equal(compressTurns([]), null);
  assert.equal(compressTurns(null), null);
});

// ── compression disabled (default) preserves original behavior ─────────────
test('EpisodeMemory: compression off by default — old turns are simply dropped', () => {
  const em = new EpisodeMemory({ capacity: 100 });
  for (let i = 0; i < 300; i++) em.remember({ role: 'user', text: `turn ${i}` });
  assert.equal(em.size(), 100);
  assert.equal(em.summaries().length, 0, 'no summaries when compress is off');
});

// ── compression enabled keeps the gist of evicted history ──────────────────
test('EpisodeMemory: compression on — evicted turns become summaries', () => {
  const em = new EpisodeMemory({ capacity: 100, compress: true, compressChunk: 50 });
  for (let i = 0; i < 300; i++) em.remember({ role: 'user', text: `turn ${i} samsung stock` });

  // recent 100 kept verbatim
  assert.equal(em.size(), 100);
  assert.equal(em.recent(1)[0].text, 'turn 299 samsung stock');

  // the 200 evicted turns became 4 summaries of 50 turns each (buffered, not 1-by-1)
  const sums = em.summaries(100);
  assert.equal(sums.length, 4, 'should be 4 dense summaries, not many tiny ones');
  for (const s of sums) {
    assert.equal(s.count, 50, 'each summary should cover a full 50-turn chunk');
  }
});

test('EpisodeMemory: summaries stay bounded by maxSummaries', () => {
  const em = new EpisodeMemory({ capacity: 10, compress: true, compressChunk: 10, maxSummaries: 3 });
  for (let i = 0; i < 1000; i++) em.remember({ role: 'user', text: `turn ${i}` });
  assert.ok(em.summaries(100).length <= 3, 'summaries must not grow past maxSummaries');
});

test('EpisodeMemory: flushCompression captures the trailing partial chunk', () => {
  const em = new EpisodeMemory({ capacity: 10, compress: true, compressChunk: 50 });
  // evict 25 turns — less than one chunk, so they sit in the buffer
  for (let i = 0; i < 35; i++) em.remember({ role: 'user', text: `turn ${i}` });
  assert.equal(em.summaries(10).length, 0, 'no full chunk yet → no summary');
  em.flushCompression();
  assert.equal(em.summaries(10).length, 1, 'flush should summarize the buffered remainder');
});

test('EpisodeMemory: a custom summarizer can be plugged in (e.g. an LLM)', () => {
  let called = 0;
  const fakeLLM = (turns) => { called++; return { kind: 'summary', count: turns.length, gist: 'LLM summary' }; };
  const em = new EpisodeMemory({ capacity: 10, compress: true, compressChunk: 10, summarizer: fakeLLM });
  for (let i = 0; i < 30; i++) em.remember({ role: 'user', text: `turn ${i}` });
  assert.ok(called >= 1, 'custom summarizer should be invoked');
  assert.equal(em.summaries(10)[0].gist, 'LLM summary');
});

test('EpisodeMemory: clear() wipes turns, summaries, and buffer', () => {
  const em = new EpisodeMemory({ capacity: 10, compress: true, compressChunk: 10 });
  for (let i = 0; i < 50; i++) em.remember({ role: 'user', text: `turn ${i}` });
  em.clear();
  assert.equal(em.size(), 0);
  assert.equal(em.summaries(10).length, 0);
});
