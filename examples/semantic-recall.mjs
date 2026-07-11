// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang).
// Dual-licensed: GNU AGPL-3.0-or-later (see /LICENSE) OR a commercial license.

// ---------------------------------------------------------------------------
// examples/semantic-recall.mjs — RAG-like memory recall, running locally.
//
// Stores facts, then recalls them by MEANING (not exact keyword). Uses the local MiniLM
// ONNX embedder when available, else a dependency-free lexical fallback.
//
// To use the real MiniLM (recommended, much better synonym handling):
//   1) python training/scripts/export_embedder.py --out training/checkpoints/embedder.onnx
//   2) npm i onnxruntime-node @xenova/transformers
//   3) EMBEDDER_ONNX=training/checkpoints/embedder.onnx node examples/semantic-recall.mjs
//
// Without those it runs on the lexical fallback (works offline, lower synonym quality).
//
//   node examples/semantic-recall.mjs
// ---------------------------------------------------------------------------

import { createEmbeddingProvider, SemanticRetriever } from '../core/retrieval/index.js';
import { SemanticMemory } from '../core/memory/SemanticMemory.js';

const modelPath = process.env.EMBEDDER_ONNX || null;
const tokenizerDir = process.env.EMBEDDER_TOKENIZER || null;

const { provider, kind, fellBack, reason } = await createEmbeddingProvider({ modelPath, tokenizerDir });
console.log(`\n🔎 CogMesh semantic recall`);
console.log(`   embedding backend: ${kind}${fellBack ? `  (fell back — ${reason})` : ''}`);
if (kind === 'hashing') {
  console.log(`   tip: export the MiniLM ONNX for real synonym understanding (see file header)\n`);
} else {
  console.log('');
}

const mem = new SemanticMemory({ retriever: new SemanticRetriever(provider) });

// remember some facts
const facts = [
  ['samsung_sector', '삼성전자는 반도체 섹터의 대표 기업이다'],
  ['risk_policy', '손실을 제한하려면 포지션 크기를 줄이고 분산투자한다'],
  ['hedge', '리스크 회피를 위해 헤지 포지션을 사용한다'],
  ['lunch', '오늘 점심은 김치찌개를 먹었다'],
  ['hobby', '주말에는 사진 촬영을 즐긴다'],
];
for (const [k, v] of facts) mem.assert(k, v, 0.9);
await new Promise((r) => setTimeout(r, 60)); // let async indexing settle

async function ask(q, k = 3) {
  console.log(`   질의: "${q}"`);
  const hits = await mem.recall(q, { k });
  for (const h of hits) console.log(`     ${h.score.toFixed(3)}  ${h.key} — ${h.value}`);
  console.log('');
}

await ask('반도체 회사에 대한 정보');
await ask('위험을 줄이는 방법');   // should surface risk_policy + hedge, not lunch/hobby

console.log(`   stored ${mem.all().length} facts; recall is by meaning, offline, no API.\n`);
