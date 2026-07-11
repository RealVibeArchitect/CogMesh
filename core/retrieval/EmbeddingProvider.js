// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/retrieval/EmbeddingProvider.js — turn text into vectors, locally.
//
// Semantic retrieval needs an embedding function. CogMesh runs this LOCALLY (no embedding
// API): the primary backend is the same multilingual MiniLM that powers the PAD encoder,
// exported to ONNX (see training/scripts/export_embedder.py) and run via onnxruntime-node.
//
// Because a heavyweight model isn't always present (CI, quick dev, browser), the provider
// degrades gracefully to a dependency-free lexical embedding. Both implement one interface:
//
//     embed(text) → Promise<Float32Array>   // L2-normalized, so cosine == dot product
//     embedBatch(texts) → Promise<Float32Array[]>
//     readonly dim, readonly kind
//
// The retriever doesn't care which backend it got — only the vectors. Swap freely.

/** cosine similarity of two equal-length, ideally L2-normalized vectors. */
export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

function l2normalize(vec) {
  let n = 0;
  for (let i = 0; i < vec.length; i++) n += vec[i] * vec[i];
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < vec.length; i++) vec[i] /= n;
  return vec;
}

/**
 * Dependency-free lexical embedding: hashed character n-grams → fixed-width vector.
 * Multilingual by construction (operates on Unicode code points, so Korean & English both
 * work). Lower quality than MiniLM — it captures surface overlap, not deep meaning — but it
 * needs no model, runs anywhere, and is deterministic. Used as the fallback backend and for
 * tests/CI. This is honest about what it is: a floor, not a replacement for MiniLM.
 *
 * Returned vectors may be shared via the internal memo — treat them as READ-ONLY.
 * (Every consumer in CogMesh only reads them; if you must mutate, copy first.)
 */
export class HashingEmbedder {
  /**
   * @param {{ dim?:number, ngram?:number, memo?:number }} [opts]
   *   memo: LRU size for repeated-text memoization (default 256; 0 disables).
   *         Agent loops re-embed the same goals/queries constantly — caching those
   *         turns repeat embeds into a Map lookup.
   */
  constructor({ dim = 256, ngram = 3, memo = 256 } = {}) {
    this.dim = dim;
    this.ngram = ngram;
    this.kind = 'hashing';
    this._memoMax = Math.max(0, memo | 0);
    this._memo = this._memoMax > 0 ? new Map() : null;
  }

  _vector(text) {
    if (this._memo) {
      const hit = this._memo.get(text);
      if (hit) { // LRU touch
        this._memo.delete(text);
        this._memo.set(text, hit);
        return hit;
      }
    }
    const vec = new Float32Array(this.dim);
    const s = ` ${(text || '').toLowerCase().trim()} `;
    if (s.length > 2) {
      // PERF: hash n-grams by rolling over UTF-16 code units directly — no substring
      // allocation per gram (the old slice() version generated O(len·ngram) short
      // strings). Same signed-hashing scheme, same bucket statistics.
      const len = s.length;
      const dim = this.dim;
      const G = this.ngram;
      for (let i = 0; i < len; i++) {
        let h = 0x811c9dc5; // FNV-1a seed
        const gMax = Math.min(G, len - i);
        for (let g = 0; g < gMax; g++) {
          h ^= s.charCodeAt(i + g);
          h = Math.imul(h, 0x01000193);
          const hi = h | 0;
          const idx = (hi < 0 ? -hi : hi) % dim;
          vec[idx] += (hi & 1) ? 1 : -1; // signed hashing reduces collisions' bias
        }
      }
      l2normalize(vec);
    }
    if (this._memo) {
      this._memo.set(text, vec);
      if (this._memo.size > this._memoMax) {
        this._memo.delete(this._memo.keys().next().value);
      }
    }
    return vec;
  }

  async embed(text) { return this._vector(text); }
  async embedBatch(texts) { return (texts || []).map((t) => this._vector(t)); }
}

/**
 * MiniLM sentence embeddings via onnxruntime-node. Lazily loads the runtime and tokenizer,
 * so importing this module never pulls the heavy deps unless you actually construct+init it.
 * If the runtime, model file, or tokenizer is missing, init() throws and the caller can fall
 * back to HashingEmbedder (createEmbeddingProvider does this automatically).
 */
export class MiniLMEmbedder {
  /**
   * @param {{ modelPath:string, tokenizerDir?:string, maxLength?:number, dim?:number }} opts
   */
  constructor(opts = {}) {
    if (!opts.modelPath) throw new Error('[MiniLMEmbedder] modelPath is required');
    this.modelPath = opts.modelPath;
    this.tokenizerDir = opts.tokenizerDir || null;
    this.maxLength = opts.maxLength || 128;
    this.dim = opts.dim || 384; // paraphrase-multilingual-MiniLM-L12-v2 → 384
    this.kind = 'minilm-onnx';
    this._session = null;
    this._tokenizer = null;
  }

  /** Lazily load onnxruntime-node + tokenizer. Throws if unavailable (caller falls back). */
  async init() {
    if (this._session) return this;
    const ort = await import('onnxruntime-node');            // optional dep
    const { AutoTokenizer } = await import('@xenova/transformers'); // optional dep (JS tokenizer)
    this._session = await ort.InferenceSession.create(this.modelPath);
    this._tokenizer = await AutoTokenizer.from_pretrained(this.tokenizerDir || this.modelPath);
    this._ort = ort;
    return this;
  }

  async embed(text) { return (await this.embedBatch([text]))[0]; }

  /**
   * Batched embedding. PERF (v0.2): one session.run() for the WHOLE batch with dynamic
   * padding to the longest sequence in the batch — instead of one run per text padded to
   * a fixed 128 tokens. On short Korean/English sentences that is typically a 3-10×
   * throughput win on CPU and GPU alike (fewer kernel launches, no wasted pad compute).
   * If the exported model was frozen at batch=1 (older exports), the batch run throws
   * once and we transparently fall back to the per-item path — same results either way.
   */
  async embedBatch(texts) {
    if (!this._session) await this.init();
    const list = Array.isArray(texts) ? texts : [];
    if (list.length === 0) return [];
    if (list.length === 1 || this._batchUnsupported) return this._embedSequential(list);
    try {
      return await this._embedBatched(list);
    } catch {
      // model likely exported with a fixed batch dimension — remember and fall back
      this._batchUnsupported = true;
      return this._embedSequential(list);
    }
  }

  async _embedBatched(list) {
    // tokenize each text (truncation only — we pad manually to the batch max)
    const encs = [];
    let maxLen = 1;
    for (const text of list) {
      const enc = await this._tokenizer(text, { truncation: true, max_length: this.maxLength });
      const ids = enc.input_ids.data || enc.input_ids;
      encs.push(enc);
      if (ids.length > maxLen) maxLen = ids.length;
    }
    const B = list.length;
    const ids = new BigInt64Array(B * maxLen);   // zero-filled = pad token 0
    const mask = new BigInt64Array(B * maxLen);  // zero-filled = ignore pad
    for (let b = 0; b < B; b++) {
      const eIds = encs[b].input_ids.data || encs[b].input_ids;
      const eMask = encs[b].attention_mask.data || encs[b].attention_mask;
      const off = b * maxLen;
      for (let i = 0; i < eIds.length; i++) {
        ids[off + i] = BigInt(eIds[i]);
        mask[off + i] = BigInt(eMask[i]);
      }
    }
    const feeds = {
      input_ids: new this._ort.Tensor('int64', ids, [B, maxLen]),
      attention_mask: new this._ort.Tensor('int64', mask, [B, maxLen]),
    };
    const result = await this._session.run(feeds);
    const data = result.embedding.data;
    const dim = data.length / B;
    const out = new Array(B);
    for (let b = 0; b < B; b++) {
      out[b] = l2normalize(Float32Array.from(data.subarray(b * dim, (b + 1) * dim)));
    }
    return out;
  }

  async _embedSequential(list) {
    const out = [];
    for (const text of list) {
      const enc = await this._tokenizer(text, { truncation: true, max_length: this.maxLength });
      const rawIds = enc.input_ids.data || enc.input_ids;
      const rawMask = enc.attention_mask.data || enc.attention_mask;
      const len = rawIds.length;
      const ids = new BigInt64Array(len);
      const mask = new BigInt64Array(len);
      for (let i = 0; i < len; i++) { ids[i] = BigInt(rawIds[i]); mask[i] = BigInt(rawMask[i]); }
      const feeds = {
        input_ids: new this._ort.Tensor('int64', ids, [1, len]),
        attention_mask: new this._ort.Tensor('int64', mask, [1, len]),
      };
      const result = await this._session.run(feeds);
      const emb = Float32Array.from(result.embedding.data);
      out.push(l2normalize(emb)); // model already normalizes, but be safe
    }
    return out;
  }
}

/**
 * Build the best available provider. Tries MiniLM ONNX when a modelPath is given; on any
 * failure (missing runtime/model), transparently falls back to the lexical embedder so the
 * system always has *some* semantic retrieval. Returns { provider, kind, fellBack }.
 * @param {{ modelPath?:string, tokenizerDir?:string, dim?:number, fallbackDim?:number }} [opts]
 */
export async function createEmbeddingProvider(opts = {}) {
  if (opts.modelPath) {
    try {
      const m = new MiniLMEmbedder(opts);
      await m.init();
      return { provider: m, kind: m.kind, fellBack: false };
    } catch (err) {
      // fall through to lexical — but surface why, once
      const reason = String(err && err.message || err);
      const provider = new HashingEmbedder({ dim: opts.fallbackDim });
      return { provider, kind: provider.kind, fellBack: true, reason };
    }
  }
  const provider = new HashingEmbedder({ dim: opts.fallbackDim });
  return { provider, kind: provider.kind, fellBack: false };
}

// (the FNV-1a 32-bit hashing scheme formerly in a standalone hash32() helper now runs
//  inline in HashingEmbedder's rolling n-gram loop — same constants, zero string allocs)
