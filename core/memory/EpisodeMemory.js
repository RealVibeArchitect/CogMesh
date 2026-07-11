// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang).
// Dual-licensed: GNU AGPL-3.0-or-later (see /LICENSE) OR a commercial license
// (see /COMMERCIAL-LICENSE.md). The PAD formulae, coordinate values, and algorithms
// herein are original works of the author (see the CogMesh Technical Whitepaper).
// This program is free software: redistribute/modify under the AGPL; it comes with
// NO WARRANTY. If you run a modified version over a network, the AGPL requires you to
// offer its complete source to users.

// core/memory/EpisodeMemory.js
// Episode Memory — episodic memory
//
// Remembers "when which conversation happened" in chronological order.
// Provides recency recall (recent) and keyword recall (recall).

const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

import { compressTurns } from './MemoryCompressor.js';

export class EpisodeMemory {
  /**
   * @param {{ capacity?: number, compress?: boolean, compressChunk?: number,
   *           maxSummaries?: number, summarizer?: function }} [opts]
   * default 200 turns. When compress:true, turns evicted past capacity are
   * summarized (statistically, or via a custom summarizer) instead of just dropped.
   */
  constructor(opts = {}) {
    this.capacity = clampInt(opts.capacity ?? 200, 1, 100000);
    this._turns = [];
    this._seq = 0;
    // compression (opt-in): keep the gist of evicted turns instead of losing them
    this.compress = opts.compress ?? false;
    this.compressChunk = clampInt(opts.compressChunk ?? 50, 1, 10000);
    this.maxSummaries = clampInt(opts.maxSummaries ?? 40, 1, 10000);
    this._summarizer = typeof opts.summarizer === 'function' ? opts.summarizer : compressTurns;
    this._summaries = [];
    this._evictBuffer = []; // evicted turns wait here until a full chunk accumulates
  }

  remember({ role = 'user', text, meta = {} } = {}) {
    if (!text || typeof text !== 'string') return null;
    const entry = { id: ++this._seq, role, text, meta, t: Date.now() };
    this._turns.push(entry);
    if (this._turns.length > this.capacity) {
      const overflow = this._turns.length - this.capacity;
      const evicted = this._turns.splice(0, overflow);
      if (this.compress) this._absorb(evicted);
    }
    return entry;
  }

  /**
   * Buffer evicted turns and summarize them one full chunk at a time. Buffering
   * matters because eviction usually happens one turn at a time — without it we'd
   * produce many 1-turn "summaries" instead of few dense ones.
   */
  _absorb(evicted) {
    this._evictBuffer.push(...evicted);
    while (this._evictBuffer.length >= this.compressChunk) {
      const chunk = this._evictBuffer.splice(0, this.compressChunk);
      const summary = this._summarizer(chunk);
      if (summary) this._summaries.push(summary);
    }
    // keep summaries bounded — drop the oldest (least relevant) ones
    if (this._summaries.length > this.maxSummaries) {
      this._summaries.splice(0, this._summaries.length - this.maxSummaries);
    }
  }

  /** Flush any buffered evicted turns into a final summary (call at session end). */
  flushCompression() {
    if (this._evictBuffer.length > 0) {
      const summary = this._summarizer(this._evictBuffer.splice(0));
      if (summary) this._summaries.push(summary);
      if (this._summaries.length > this.maxSummaries) {
        this._summaries.splice(0, this._summaries.length - this.maxSummaries);
      }
    }
    return this._summaries;
  }

  /** Compressed summaries of older, evicted history (newest last). */
  summaries(n = 10) {
    return this._summaries.slice(-Math.max(1, n));
  }

  recent(n = 10) {
    return this._turns.slice(-Math.max(1, n));
  }

  recall(keyword, limit = 5) {
    if (!keyword) return [];
    const kw = keyword.toLowerCase();
    return this._turns
      .filter((t) => t.text.toLowerCase().includes(kw))
      .slice(-limit)
      .reverse();
  }

  size() {
    return this._turns.length;
  }

  clear() {
    this._turns = [];
    this._seq = 0;
    this._summaries = [];
    this._evictBuffer = [];
  }

  snapshot() {
    return { capacity: this.capacity, turns: [...this._turns], summaries: [...this._summaries] };
  }
}
