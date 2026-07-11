// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/retrieval/index.js — local semantic retrieval (RAG-like memory recall).
//
//   - EmbeddingProvider     text → vector, locally. MiniLM ONNX with a lexical fallback.
//   - SemanticRetriever     embed-once vector store with top-k cosine search.
//
// Primary backend is the same multilingual MiniLM that powers the PAD encoder, exported to
// ONNX (training/scripts/export_embedder.py) and run via onnxruntime-node — no embedding API,
// fully local. Degrades to a dependency-free lexical embedder when the model isn't present.

export {
  cosine,
  HashingEmbedder,
  MiniLMEmbedder,
  createEmbeddingProvider,
} from './EmbeddingProvider.js';
export { SemanticRetriever } from './SemanticRetriever.js';
