// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// test/optimization.test.mjs — contracts for the v0.2 optimization pass.
//
// Every hot-path rewrite here is guarded by a behavioral contract, so a future
// refactor can't silently trade correctness for speed:
//
//   WorldModel        fast branch() isolation + O(1) setField observable semantics
//   RolloutCache      reference-memoized keys ≡ value keys; LRU + invalidate intact
//   SemanticRetriever packed scan ≡ brute-force cosine ranking; persistence roundtrip
//   HashingEmbedder   memo determinism; read-only sharing; memo:0 opt-out
//   AttentionManager  prioritize(nodes, situation, precomputedScores) reuse path
//   root index.js     the façade exposes the whole public API

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { WorldModel } from '../core/world/WorldModel.js';
import { WorldSimulator } from '../core/world/WorldSimulator.js';
import { RolloutCache } from '../core/cognition/RolloutCache.js';
import { AttentionManager } from '../core/cognition/AttentionManager.js';
import { HashingEmbedder, cosine } from '../core/retrieval/EmbeddingProvider.js';
import { SemanticRetriever } from '../core/retrieval/SemanticRetriever.js';

// ── WorldModel: fast branch ─────────────────────────────────────────────────

test('branch: mutating the branch never touches the source (objects/relations/fields)', () => {
  const w = new WorldModel();
  w.addObject({ id: 'a', state: { price: 100 }, attrs: { sector: 'tech' } });
  w.addObject({ id: 'b', state: { price: 50 } });
  w.addRelation({ from: 'a', to: 'b', weight: 0.7 });
  w.setField('wealth', 100);

  const b = w.branch();
  b.addObject({ id: 'a', state: { price: 999 } });
  b.setField('wealth', -1);
  b.setField('newField', 42);
  b.removeObject('b');

  assert.equal(w.getObject('a').state.price, 100, 'source object state untouched');
  assert.equal(w.getField('wealth'), 100, 'source field untouched');
  assert.equal(w.getField('newField'), undefined, 'new branch field invisible to source');
  assert.ok(w.getObject('b'), 'source keeps the removed object');
  assert.equal(w.listRelations().length, 1, 'source keeps its relation');
});

test('branch: equivalent to the old snapshot→restore path (same visible state)', () => {
  const w = new WorldModel();
  w.addObject({ id: 'x', state: { v: 1 }, attrs: { k: 'y' } });
  w.addObject({ id: 'y', state: { v: 2 } });
  w.addRelation({ id: 'r1', from: 'x', to: 'y', type: 'causal', weight: 0.5 });
  w.setField('f1', 3.14);

  const fast = w.branch();
  const slow = new WorldModel().restore(w.snapshot());

  assert.deepEqual(fast.getFieldSnapshot(), slow.getFieldSnapshot());
  assert.deepEqual(
    fast.listObjects().map((o) => ({ id: o.id, state: o.state, attrs: o.attrs })),
    slow.listObjects().map((o) => ({ id: o.id, state: o.state, attrs: o.attrs })),
  );
  assert.deepEqual(
    fast.listRelations().map((r) => ({ from: r.from, to: r.to, type: r.type, weight: r.weight })),
    slow.listRelations().map((r) => ({ from: r.from, to: r.to, type: r.type, weight: r.weight })),
  );
  assert.equal(fast.snapshot().t, slow.snapshot().t, 'logical time matches');
});

test('setField: in-place write is invisible through snapshots (copies, not references)', () => {
  const w = new WorldModel();
  w.setField('a', 1);
  const snap1 = w.getFieldSnapshot();
  w.setField('a', 2);
  assert.equal(snap1.a, 1, 'earlier snapshot is a stable copy');
  const snap2 = w.getFieldSnapshot();
  snap2.a = 999;
  assert.equal(w.getField('a'), 2, 'mutating a snapshot never writes back');
});

// ── RolloutCache: memoized keys ─────────────────────────────────────────────

function makeSim() {
  const w = new WorldModel();
  w.setField('wealth', 100);
  return new WorldSimulator(w, { goalWeights: { wealth: 1 } });
}

test('cache: value-equal actions with DIFFERENT object identities share one entry', () => {
  const cache = new RolloutCache(makeSim());
  const a1 = { field: { wealth: 120 } };
  const a2 = { field: { wealth: 120 } }; // equal by value, distinct by reference
  const r1 = cache.rollout(a1);
  const r2 = cache.rollout(a2);
  assert.equal(cache.stats().misses, 1, 'second value-equal action is a hit');
  assert.equal(cache.stats().hits, 1);
  assert.equal(r1.score, r2.score);
});

test('cache: same-reference repeat (the mesh pattern) hits without recomputing the key', () => {
  const cache = new RolloutCache(makeSim());
  const action = { field: { wealth: 130 } };
  cache.rollout(action);
  for (let i = 0; i < 100; i++) cache.rollout(action);
  assert.equal(cache.stats().hits, 100);
  assert.equal(cache.stats().misses, 1);
});

test('cache: steps is part of the key even for the same action reference', () => {
  const cache = new RolloutCache(makeSim());
  const action = { field: { wealth: 130 } };
  cache.rollout(action, { steps: 1 });
  cache.rollout(action, { steps: 2 });
  assert.equal(cache.stats().misses, 2, 'different steps → different entries');
  cache.rollout(action, { steps: 1 });
  cache.rollout(action, { steps: 2 });
  assert.equal(cache.stats().hits, 2);
});

test('cache: LRU eviction still works with the key memo in front', () => {
  const cache = new RolloutCache(makeSim(), { max: 2 });
  const a = { field: { wealth: 1 } }, b = { field: { wealth: 2 } }, c = { field: { wealth: 3 } };
  cache.rollout(a); cache.rollout(b); cache.rollout(c); // a evicted
  cache.rollout(a);
  assert.equal(cache.stats().misses, 4, 'evicted entry re-simulates on return');
});

test('cache: invalidate() clears results but stays correct for memoized keys', () => {
  const cache = new RolloutCache(makeSim());
  const action = { field: { wealth: 150 } };
  cache.rollout(action);
  cache.invalidate();
  cache.rollout(action); // memoized key, empty cache → must MISS and recompute
  assert.equal(cache.stats().misses, 2);
});

// ── SemanticRetriever: packed scan + persistence ────────────────────────────

test('retriever: bounded top-k over the packed matrix ≡ brute-force cosine ranking', async () => {
  const r = new SemanticRetriever(new HashingEmbedder({ dim: 64, memo: 0 }), { max: 500 });
  const entries = Array.from({ length: 200 }, (_, i) => ({
    text: `item ${i} topic ${i % 17} 주제 ${i % 7} strategy`, payload: i,
  }));
  await r.addBatch(entries);

  const q = 'topic strategy 주제 5';
  const got = await r.query(q, { k: 7 });
  const qv = await r.provider.embed(q);
  const brute = [...r._items.values()]
    .map((it) => ({ payload: it.payload, score: cosine(qv, it.vec) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 7);

  assert.equal(got.length, 7);
  for (let i = 0; i < 7; i++) {
    assert.equal(got[i].payload, brute[i].payload, `rank ${i} matches brute force`);
    assert.ok(Math.abs(got[i].score - brute[i].score) < 1e-9, `score ${i} matches brute force`);
  }
});

test('retriever: mutations after a query refresh the packed index (no stale results)', async () => {
  const r = new SemanticRetriever(new HashingEmbedder({ memo: 0 }));
  await r.add('반도체 실적 분석', { tag: 'semi' });
  await r.query('warm');                       // builds the pack
  const id2 = await r.add('리스크 회피 전략', { tag: 'risk' });   // mutate AFTER pack
  let hits = await r.query('위험 관리 리스크', { k: 2 });
  assert.equal(hits.length, 2, 'newly added item is queryable');
  assert.equal(hits[0].payload.tag, 'risk');

  r.remove(id2);                               // mutate again
  hits = await r.query('위험 관리 리스크', { k: 2 });
  assert.ok(hits.every((h) => h.payload.tag !== 'risk'), 'removed item never resurfaces');
});

test('retriever: minScore filtering and k-bounding behave as before', async () => {
  const r = new SemanticRetriever(new HashingEmbedder({ memo: 0 }));
  await r.add('완전히 다른 주제의 문장', { tag: 'other' });
  await r.add('semantic retrieval ranking test', { tag: 'match' });
  const strict = await r.query('semantic retrieval ranking', { k: 5, minScore: 0.9 });
  assert.ok(strict.length <= 1, 'high threshold filters weak hits');
  const loose = await r.query('semantic retrieval ranking', { k: 1 });
  assert.equal(loose.length, 1, 'k bounds the result count');
  assert.equal(loose[0].payload.tag, 'match');
});

test('retriever: serialize → deserialize roundtrip preserves queries without re-embedding', async () => {
  const embedder = new HashingEmbedder({ dim: 64, memo: 0 });
  const r1 = new SemanticRetriever(embedder, { max: 100 });
  await r1.addBatch([
    { text: '삼성전자 반도체', payload: 'semi', id: 'k1' },
    { text: '김치찌개 점심', payload: 'food', id: 'k2' },
    { text: 'portfolio risk hedge', payload: 'risk', id: 'k3' },
  ]);
  const before = await r1.query('반도체 회사', { k: 2 });

  const snap = r1.serialize();
  assert.equal(snap.v, 1);
  assert.equal(snap.items.length, 3);

  const r2 = new SemanticRetriever(new HashingEmbedder({ dim: 64, memo: 0 }), { max: 100 });
  assert.equal(r2.deserialize(snap), true, 'matching kind/dim restores');
  assert.equal(r2.size, 3);
  const after = await r2.query('반도체 회사', { k: 2 });
  assert.deepEqual(after.map((h) => h.payload), before.map((h) => h.payload));
  assert.ok(Math.abs(after[0].score - before[0].score) < 1e-9, 'scores identical after restore');
});

test('retriever: deserialize refuses a mismatched vector space (kind/dim guard)', async () => {
  const r1 = new SemanticRetriever(new HashingEmbedder({ dim: 64 }));
  await r1.add('hello world');
  const snap = r1.serialize();
  const r2 = new SemanticRetriever(new HashingEmbedder({ dim: 128 })); // different dim
  assert.equal(r2.deserialize(snap), false, 'dim mismatch → refuse (would corrupt similarity)');
  assert.equal(r2.size, 0);
});

// ── HashingEmbedder: memo semantics ─────────────────────────────────────────

test('embedder: memoized vectors are deterministic and identical to memo-off vectors', async () => {
  const memoed = new HashingEmbedder({ dim: 96 });
  const plain = new HashingEmbedder({ dim: 96, memo: 0 });
  const text = 'CogMesh PAD 메타인지 rolling hash 검증';
  const v1 = await memoed.embed(text);
  const v2 = await memoed.embed(text);       // memo hit
  const v3 = await plain.embed(text);        // fresh compute
  assert.equal(v1, v2, 'memo returns the same (read-only) vector instance');
  assert.deepEqual(Array.from(v1), Array.from(v3), 'memo path ≡ compute path');
});

test('embedder: memo LRU stays bounded', async () => {
  const e = new HashingEmbedder({ dim: 32, memo: 4 });
  for (let i = 0; i < 20; i++) await e.embed(`text ${i}`);
  assert.ok(e._memo.size <= 4, 'memo never exceeds its cap');
});

// ── AttentionManager: precomputed-score reuse ───────────────────────────────

test('attention: prioritize reusing attend() scores matches recomputation', () => {
  const am = new AttentionManager({ topK: 4 });
  const situation = { goal: 'avoid risk and loss' };
  const { scores } = am.attend(situation);
  const nodes = [{ id: 'n1', lens: 'risk', meta: {} }, { id: 'n2', lens: 'creativity', meta: {} }];
  const reused = am.prioritize(nodes, situation, scores);
  const fresh = am.prioritize(nodes, situation);
  assert.equal(reused[0].meta.priority, scores.risk);
  assert.ok(reused[0].meta.priority > reused[1].meta.priority, 'risk outranks creativity for a risk goal');
  assert.deepEqual(
    fresh.map((n) => n.meta.priority),
    reused.map((n) => n.meta.priority).map((p, i) => (i === 0 ? am.score(situation).risk : am.score(situation).creativity)),
  );
});

// ── root façade ─────────────────────────────────────────────────────────────

test('root index.js exposes the integrated public API', async () => {
  const api = await import('../index.js');
  for (const name of [
    'CogMeshAgent', 'CognitiveMesh', 'WorldModel', 'WorldSimulator',
    'SemanticRetriever', 'createEmbeddingProvider', 'PADState', 'nearestEmotion',
    'AgentLoop', 'ToolRegistry', 'MeshRouter', 'ConstitutionRuntime',
    'RolloutCache', 'WorkerPool', 'StabilityGuard', 'MetaReasoner',
  ]) {
    assert.ok(name in api, `façade exports ${name}`);
  }
});
