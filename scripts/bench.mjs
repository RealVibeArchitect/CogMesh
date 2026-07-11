// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// scripts/bench.mjs — reproducible micro/meso benchmarks for the hot paths.
//
//   node scripts/bench.mjs
//
// Measures (median of repeated runs, after warm-up):
//   1. WorldModel.branch()            — the per-rollout world copy
//   2. WorldSimulator.rollout()       — raw single-future simulation
//   3. RolloutCache hit path          — cost of a memoized repeat
//   4. CognitiveMesh.run()            — the full cognitive loop, end-to-end
//   5. SemanticRetriever.query()      — top-k over 2,000 indexed items
//   6. HashingEmbedder.embed()        — the lexical fallback embedding
//   7. EvaluationCouncil.deliberate() — council + debate over a beam

import { WorldModel } from '../core/world/WorldModel.js';
import { WorldSimulator } from '../core/world/WorldSimulator.js';
import { RolloutCache } from '../core/cognition/RolloutCache.js';
import { CognitiveMesh } from '../core/cognition/CognitiveMesh.js';
import { EvaluationCouncil } from '../core/cognition/EvaluationCouncil.js';
import { buildDefaultCouncil } from '../core/cognition/evaluators.js';
import { HashingEmbedder } from '../core/retrieval/EmbeddingProvider.js';
import { SemanticRetriever } from '../core/retrieval/SemanticRetriever.js';

const now = () => performance.now();

function stats(samples) {
  const s = samples.slice().sort((a, b) => a - b);
  const mid = s[Math.floor(s.length / 2)];
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  return { median: mid, mean, min: s[0], max: s[s.length - 1] };
}

/** Run fn repeatedly: `warm` warm-up passes, then `runs` timed passes. Awaits async fns. */
async function bench(label, fn, { warm = 3, runs = 9 } = {}) {
  for (let i = 0; i < warm; i++) await fn();
  const samples = [];
  for (let i = 0; i < runs; i++) {
    const t0 = now();
    await fn();
    samples.push(now() - t0);
  }
  const st = stats(samples);
  console.log(
    `${label.padEnd(46)} median ${st.median.toFixed(3).padStart(9)} ms   ` +
    `mean ${st.mean.toFixed(3).padStart(9)} ms   (min ${st.min.toFixed(3)} / max ${st.max.toFixed(3)})`
  );
  return st;
}

// ── fixture: a moderately populated world ─────────────────────────────────
function buildWorld({ objects = 40, relations = 60, fields = 24 } = {}) {
  const w = new WorldModel();
  for (let i = 0; i < objects; i++) {
    w.addObject({ id: `obj${i}`, state: { price: 100 + i, qty: i % 7 }, attrs: { sector: `s${i % 5}` } });
  }
  for (let i = 0; i < relations; i++) {
    w.addRelation({ from: `obj${i % objects}`, to: `obj${(i * 3 + 1) % objects}`, weight: (i % 10) / 10 });
  }
  for (let i = 0; i < fields; i++) w.setField(`f${i}`, i * 1.5);
  w.setField('wealth', 100);
  w.setField('risk', 0.2);
  return w;
}

console.log(`\nCogMesh bench — node ${process.version}\n`);

const results = {};

// 1) branch
{
  const w = buildWorld();
  results.branch = await bench('WorldModel.branch() [40 obj/60 rel/26 f]', () => {
    for (let i = 0; i < 200; i++) w.branch();
  });
}

// 2) raw rollout
{
  const w = buildWorld();
  const sim = new WorldSimulator(w, { goalWeights: { wealth: 1, risk: -0.5 } });
  const action = { field: { wealth: 130, risk: 0.3 }, effects: { obj1: { price: 111 } } };
  results.rollout = await bench('WorldSimulator.rollout() x200', () => {
    for (let i = 0; i < 200; i++) sim.rollout(action, { steps: 1 });
  });
}

// 3) cache hit path (same action object repeated — the mesh's dominant pattern)
{
  const w = buildWorld();
  const sim = new WorldSimulator(w, { goalWeights: { wealth: 1, risk: -0.5 } });
  const cache = new RolloutCache(sim);
  const action = { field: { wealth: 130, risk: 0.3 }, effects: { obj1: { price: 111 } } };
  cache.rollout(action); // prime
  results.cacheHit = await bench('RolloutCache HIT path x2000', () => {
    for (let i = 0; i < 2000; i++) cache.rollout(action, { steps: 1 });
  });
}

// 4) full cognitive loop
{
  results.mesh = await bench('CognitiveMesh.run() [full loop]', () => {
    const w = buildWorld({ objects: 20, relations: 25, fields: 10 });
    const sim = new WorldSimulator(w, { goalWeights: { wealth: 1, risk: -0.6 } });
    const mesh = new CognitiveMesh({ simulator: sim });
    mesh.run('grow wealth while managing risk');
  }, { warm: 2, runs: 7 });
}

// 5) retrieval query over 2000 items
{
  const embedder = new HashingEmbedder({ dim: 256 });
  const retriever = new SemanticRetriever(embedder, { max: 5000 });
  const seedTexts = [];
  for (let i = 0; i < 2000; i++) {
    seedTexts.push({ text: `memory item ${i} about topic ${i % 37} risk market strategy 항목 ${i % 13}` });
  }
  await retriever.addBatch(seedTexts);
  results.retrQuery = await bench('SemanticRetriever.query() k=5 over 2000 x50', async () => {
    for (let i = 0; i < 50; i++) await retriever.query('risk strategy for market 항목', { k: 5 });
  }, { warm: 3, runs: 9 });
}

// 6) hashing embedder
{
  const embedder = new HashingEmbedder({ dim: 256 });
  const text = 'CogMesh는 PAD 기반 메타인지와 병렬 세계 시뮬레이션을 결합한 인지 아키텍처입니다. risk and cost tradeoffs matter.';
  results.embed = await bench('HashingEmbedder.embed() x500', () => {
    for (let i = 0; i < 500; i++) embedder._vector(text);
  });
}

// 7) council deliberation over a 16-node beam
{
  const council = new EvaluationCouncil(buildDefaultCouncil({ getGoalText: () => 'grow wealth manage risk' }), { debateRounds: 1 });
  const nodes = Array.from({ length: 16 }, (_, i) => ({
    id: `n${i}`, lens: ['logic', 'risk', 'cost', 'goal'][i % 4],
    score: 100 - i * 3,
    action: { field: { wealth: 120 + i, risk: 0.1 * (i % 5) } },
    future: { field: { wealth: 120 + i, risk: 0.1 * (i % 5) } },
    meta: { confidence: 0.5 + (i % 5) / 10 },
  }));
  results.council = await bench('EvaluationCouncil.deliberate() 16 nodes x50', () => {
    for (let i = 0; i < 50; i++) council.deliberate(nodes, {});
  });
}

console.log('\nJSON:', JSON.stringify(Object.fromEntries(
  Object.entries(results).map(([k, v]) => [k, +v.median.toFixed(3)])
)));
