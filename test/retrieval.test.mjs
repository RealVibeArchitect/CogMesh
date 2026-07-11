// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// test/retrieval.test.mjs — local semantic retrieval (RAG-like recall).
//
//   node --test test/retrieval.test.mjs
//
// These run on the dependency-free lexical fallback so they need no model download. The
// MiniLM ONNX path shares the exact same interface (createEmbeddingProvider swaps backends),
// so a passing suite here validates the contract the ONNX backend must also satisfy.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  cosine, HashingEmbedder, createEmbeddingProvider, SemanticRetriever,
} from '../core/retrieval/index.js';
import { SemanticMemory } from '../core/memory/SemanticMemory.js';

test('cosine: identical normalized vectors → 1, orthogonal → 0', () => {
  const a = Float32Array.from([1, 0, 0]);
  const b = Float32Array.from([1, 0, 0]);
  const c = Float32Array.from([0, 1, 0]);
  assert.ok(Math.abs(cosine(a, b) - 1) < 1e-9);
  assert.ok(Math.abs(cosine(a, c)) < 1e-9);
});

test('hashing embedder: deterministic, normalized, fixed dim', async () => {
  const e = new HashingEmbedder({ dim: 128 });
  const v1 = await e.embed('hello world');
  const v2 = await e.embed('hello world');
  assert.equal(v1.length, 128);
  assert.deepEqual(Array.from(v1), Array.from(v2), 'deterministic');
  const norm = Math.sqrt(Array.from(v1).reduce((s, x) => s + x * x, 0));
  assert.ok(Math.abs(norm - 1) < 1e-6 || norm === 0, 'L2-normalized');
});

test('provider factory: no modelPath → lexical fallback, no error', async () => {
  const { provider, kind, fellBack } = await createEmbeddingProvider();
  assert.equal(kind, 'hashing');
  assert.equal(fellBack, false);
  assert.ok(provider.dim > 0);
});

test('provider factory: bad modelPath → graceful fallback with reason', async () => {
  const { kind, fellBack, reason } = await createEmbeddingProvider({ modelPath: '/no/such/model.onnx' });
  assert.equal(kind, 'hashing', 'fell back to lexical');
  assert.equal(fellBack, true);
  assert.ok(typeof reason === 'string' && reason.length > 0, 'surfaced a reason');
});

test('retriever: ranks surface-overlapping text above unrelated text', async () => {
  // NOTE: this runs on the lexical fallback, which matches CHARACTER overlap, not deep
  // synonymy. So we test what it can actually do — a query sharing words with a stored item
  // beats an unrelated one. The MiniLM ONNX backend (same interface) additionally handles
  // synonyms like "위험 관리" ↔ "리스크 회피"; that quality isn't expected of the fallback.
  const { provider } = await createEmbeddingProvider();
  const r = new SemanticRetriever(provider);
  await r.addBatch([
    { text: 'risk management and position sizing', payload: { tag: 'risk' } },
    { text: 'a cream pasta recipe with garlic', payload: { tag: 'food' } },
  ]);
  const hits = await r.query('risk management strategy for position sizing', { k: 2 });
  assert.equal(hits[0].payload.tag, 'risk', 'the word-overlapping item ranks first');
  assert.ok(hits[0].score > hits[1].score, 'and scores strictly higher');
});

test('retriever: query on empty index returns []', async () => {
  const { provider } = await createEmbeddingProvider();
  const r = new SemanticRetriever(provider);
  assert.deepEqual(await r.query('anything'), []);
});

test('retriever: minScore filters weak matches', async () => {
  const { provider } = await createEmbeddingProvider();
  const r = new SemanticRetriever(provider);
  await r.add('quantum chromodynamics lattice gauge theory');
  const hits = await r.query('chocolate cake baking tips', { k: 5, minScore: 0.9 });
  assert.equal(hits.length, 0, 'unrelated query filtered out at high threshold');
});

test('retriever: payload round-trips on a hit', async () => {
  const { provider } = await createEmbeddingProvider();
  const r = new SemanticRetriever(provider);
  await r.add('samsung is a semiconductor company', { ticker: '005930' });
  const [hit] = await r.query('semiconductor company', { k: 1 });
  assert.equal(hit.payload.ticker, '005930');
});

test('retriever: LRU eviction respects the cap', async () => {
  const { provider } = await createEmbeddingProvider();
  const r = new SemanticRetriever(provider, { max: 2 });
  await r.add('one'); await r.add('two'); await r.add('three');
  assert.ok(r.size <= 2);
});

test('SemanticMemory: recall works with a retriever, [] without', async () => {
  const { provider } = await createEmbeddingProvider();

  const plain = new SemanticMemory();
  plain.assert('k', 'v');
  assert.deepEqual(await plain.recall('anything'), [], 'no retriever → empty recall');

  const smart = new SemanticMemory({ retriever: new SemanticRetriever(provider) });
  smart.assert('semi', '삼성전자는 반도체 회사다');
  smart.assert('food', '점심은 김치찌개');
  await new Promise((res) => setTimeout(res, 30)); // let async indexing settle
  const hits = await smart.recall('반도체 기업', { k: 1 });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].key, 'semi', 'recalled the semiconductor fact by meaning');
});

test('SemanticMemory: existing key-value behavior is preserved', () => {
  const mem = new SemanticMemory();
  mem.assert('x', 42, 0.9);
  assert.equal(mem.get('x').value, 42);
  assert.equal(mem.has('x'), true);
  mem.forget('x');
  assert.equal(mem.get('x'), null);
});
