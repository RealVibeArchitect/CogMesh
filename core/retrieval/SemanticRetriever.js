// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/retrieval/SemanticRetriever.js — RAG-like semantic recall over memories.
//
// Keyword lookup can't connect "위험 관리" to a query for "리스크 회피" — they share meaning
// but not characters. This retriever embeds each stored item once and answers queries by
// vector similarity, so recall is by MEANING, not exact match. It's the retrieval half of a
// RAG loop: given a situation, surface the most relevant past facts/episodes for the mesh to
// reason with.
//
//     add(text, payload) → embed once, store (vector, payload)
//     query(text, k)     → embed query, return top-k by cosine similarity
//
// Backed by any EmbeddingProvider (MiniLM ONNX locally, or the lexical fallback). The store
// is a flat in-memory index with exact cosine search — simple, correct, and fast enough for
// tens of thousands of items. (A larger corpus would swap in an ANN index behind the same API.)
//
// PERF NOTES (v0.2 optimization pass):
//   • each item precomputes 1/‖v‖ at add time, so a query does ONE dot product per item
//     instead of dot + two norms — exactly the same cosine value, ~3× fewer flops.
//   • top-k is selected with a bounded insertion pass (O(n·k), k is small) instead of
//     materializing + sorting all n scored objects (O(n log n) + n allocations).
//   • serialize()/deserialize() persist the index (vectors as base64), so a restart
//     never pays to re-embed the corpus — embedding is the expensive step.

let _seq = 0;

/** 1/‖v‖ (0 for a zero vector, so its dot-scores stay 0 — same as cosine()). */
function invNorm(vec) {
  let n = 0;
  for (let i = 0; i < vec.length; i++) n += vec[i] * vec[i];
  n = Math.sqrt(n);
  return n > 0 ? 1 / n : 0;
}

export class SemanticRetriever {
  /**
   * @param {object} provider  an EmbeddingProvider (embed/embedBatch/dim/kind)
   * @param {{ max?:number }} [opts]  cap on stored items (LRU-evicts oldest past the cap)
   */
  constructor(provider, opts = {}) {
    if (!provider || typeof provider.embed !== 'function') {
      throw new Error('[SemanticRetriever] an EmbeddingProvider is required');
    }
    this.provider = provider;
    this.max = Number.isFinite(opts.max) ? Math.max(1, opts.max) : 5000;
    this._items = new Map(); // id → { id, text, payload, vec, inv, t }
    // PERF: queries scan a PACKED row-major matrix (one contiguous Float32Array) instead
    // of chasing per-item vector pointers through the Map — far better cache locality.
    // The pack is rebuilt lazily on the first query after any mutation (add/remove/clear),
    // so add-heavy phases pay nothing and query-heavy phases scan at memory bandwidth.
    this._pack = null;   // { mat:Float32Array(n*stride), inv:Float32Array(n), refs:Array(n), stride }
    this._dirty = true;
  }

  get size() { return this._items.size; }

  _touch() { this._dirty = true; }

  _repack() {
    const n = this._items.size;
    if (n === 0) { this._pack = null; this._dirty = false; return; }
    let stride = 0;
    for (const it of this._items.values()) if (it.vec.length > stride) stride = it.vec.length;
    // Float64Array on purpose: every f32 value is exactly representable in f64, so scores
    // are BIT-IDENTICAL to scanning the f32 vectors — but V8 skips the per-load f32→f64
    // conversion, which measures ~1.5× faster on the scan. Memory doubles (still tiny:
    // 5k items × 384 dims ≈ 15 MB), a good trade for the hot path.
    const mat = new Float64Array(n * stride); // zero-padded rows — pads contribute 0 to dots
    const inv = new Float64Array(n);
    const refs = new Array(n);
    let r = 0;
    for (const it of this._items.values()) {
      mat.set(it.vec, r * stride);
      inv[r] = it.inv;
      refs[r] = it;
      r++;
    }
    this._pack = { mat, inv, refs, stride };
    this._dirty = false;
  }

  /**
   * Add one item: embed its text once and store it with an arbitrary payload.
   * @param {string} text     the text to index (what queries match against)
   * @param {any} [payload]   anything to return on a hit (the memory, an action, etc.)
   * @param {{ id?:string }} [opts]
   * @returns {Promise<string>} the item id
   */
  async add(text, payload = null, opts = {}) {
    const vec = await this.provider.embed(text || '');
    const id = opts.id || `r${++_seq}`;
    this._items.set(id, { id, text: text || '', payload, vec, inv: invNorm(vec), t: Date.now() });
    this._evict();
    this._touch();
    return id;
  }

  /**
   * Add many items efficiently (one batched embedding call).
   * @param {Array<{text:string, payload?:any, id?:string}>} entries
   * @returns {Promise<string[]>} ids
   */
  async addBatch(entries) {
    const list = Array.isArray(entries) ? entries : [];
    if (list.length === 0) return [];
    const vecs = await this.provider.embedBatch(list.map((e) => e.text || ''));
    const ids = [];
    list.forEach((e, i) => {
      const id = e.id || `r${++_seq}`;
      const vec = vecs[i];
      this._items.set(id, { id, text: e.text || '', payload: e.payload ?? null, vec, inv: invNorm(vec), t: Date.now() });
      ids.push(id);
    });
    this._evict();
    this._touch();
    return ids;
  }

  /**
   * Semantic query: return the top-k stored items most similar to `text`.
   * @param {string} text
   * @param {{ k?:number, minScore?:number }} [opts]
   *   k: how many to return (default 5). minScore: drop hits below this cosine (default 0).
   * @returns {Promise<Array<{ id, text, payload, score }>>} best-first
   */
  async query(text, opts = {}) {
    const k = Number.isFinite(opts.k) ? Math.max(1, opts.k) : 5;
    const minScore = Number.isFinite(opts.minScore) ? opts.minScore : 0;
    if (this._items.size === 0) return [];
    const qvRaw = await this.provider.embed(text || '');
    const qInv = invNorm(qvRaw);

    if (this._dirty) this._repack();
    const { mat, inv, refs, stride } = this._pack;
    // one f64 copy of the query per call (f32 values are exact in f64 → same scores),
    // padded/truncated to the row stride — zero pads keep the dot identical to a
    // min-length dot, so cross-length behavior matches the old implementation.
    const qv = new Float64Array(stride);
    qv.set(qvRaw.length > stride ? qvRaw.subarray(0, stride) : qvRaw);

    // Bounded top-k selection over the packed rows: one 4-way-unrolled dot per row;
    // only genuine top-k contenders allocate anything.
    const nRows = refs.length;
    const top = [];            // [{ row, score }] sorted desc, length ≤ k
    let floor = -Infinity;     // score of the current kth entry (admission threshold)
    const unroll = stride - (stride % 4);

    for (let r = 0; r < nRows; r++) {
      const off = r * stride;
      let d0 = 0, d1 = 0, d2 = 0, d3 = 0;
      let i = 0;
      for (; i < unroll; i += 4) {
        const o = off + i;
        d0 += qv[i] * mat[o];
        d1 += qv[i + 1] * mat[o + 1];
        d2 += qv[i + 2] * mat[o + 2];
        d3 += qv[i + 3] * mat[o + 3];
      }
      let dot = d0 + d1 + d2 + d3;
      for (; i < stride; i++) dot += qv[i] * mat[off + i];

      const score = dot * qInv * inv[r];   // == cosine(query, item vector)
      if (score < minScore) continue;
      if (top.length >= k && score <= floor) continue;

      // binary-insert into the small window
      let lo = 0, hi = top.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (top[mid].score >= score) lo = mid + 1; else hi = mid;
      }
      top.splice(lo, 0, { row: r, score });
      if (top.length > k) top.pop();
      if (top.length === k) floor = top[k - 1].score;
    }

    return top.map(({ row, score }) => {
      const item = refs[row];
      return { id: item.id, text: item.text, payload: item.payload, score };
    });
  }

  /** Remove an item by id. */
  remove(id) {
    const removed = this._items.delete(id);
    if (removed) this._touch();
    return removed;
  }

  /** Clear the whole index. */
  clear() {
    this._items.clear();
    this._touch();
  }

  /**
   * Persist the index to a plain JSON-safe object. Vectors are packed as base64
   * Float32 buffers (compact + fast). Re-embedding is the expensive step, so
   * serializing means a restart costs ~0 instead of a full corpus embed.
   * @returns {{ v:number, kind:string, dim:number, items:Array }}
   */
  serialize() {
    const items = [];
    for (const it of this._items.values()) {
      items.push({ id: it.id, text: it.text, payload: it.payload, t: it.t, vec: packVec(it.vec) });
    }
    return { v: 1, kind: this.provider.kind || 'unknown', dim: this.provider.dim || 0, items };
  }

  /**
   * Restore an index produced by serialize(). Refuses (returns false) if the stored
   * embedding kind/dim doesn't match the current provider — mixed vector spaces would
   * silently corrupt similarity, so mismatches must re-embed instead.
   * @param {{ v:number, kind:string, dim:number, items:Array }} data
   * @returns {boolean} true if restored
   */
  deserialize(data) {
    if (!data || data.v !== 1 || !Array.isArray(data.items)) return false;
    const kind = this.provider.kind || 'unknown';
    const dim = this.provider.dim || 0;
    if (data.kind !== kind || data.dim !== dim) return false;
    this._items.clear();
    for (const it of data.items) {
      const vec = unpackVec(it.vec);
      if (!vec) continue;
      this._items.set(it.id, { id: it.id, text: it.text || '', payload: it.payload ?? null, vec, inv: invNorm(vec), t: it.t || Date.now() });
    }
    this._evict();
    this._touch();
    return true;
  }

  /** LRU eviction: drop the oldest items once over capacity. */
  _evict() {
    if (this._items.size <= this.max) return;
    // Map preserves insertion order; oldest are first
    const overflow = this._items.size - this.max;
    let i = 0;
    for (const key of this._items.keys()) {
      if (i++ >= overflow) break;
      this._items.delete(key);
    }
  }
}

// ── vector packing (Node: base64 via Buffer; elsewhere: plain number array) ──
function packVec(vec) {
  if (typeof Buffer !== 'undefined') {
    const f = vec instanceof Float32Array ? vec : Float32Array.from(vec);
    return { b64: Buffer.from(f.buffer, f.byteOffset, f.byteLength).toString('base64') };
  }
  return { arr: Array.from(vec) };
}

function unpackVec(packed) {
  if (!packed) return null;
  if (packed.b64 && typeof Buffer !== 'undefined') {
    const buf = Buffer.from(packed.b64, 'base64');
    return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  }
  if (Array.isArray(packed.arr)) return Float32Array.from(packed.arr);
  return null;
}


