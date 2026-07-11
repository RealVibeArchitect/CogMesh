// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang).
// Dual-licensed: GNU AGPL-3.0-or-later (see /LICENSE) OR a commercial license
// (see /COMMERCIAL-LICENSE.md). The PAD formulae, coordinate values, and algorithms
// herein are original works of the author (see the CogMesh Technical Whitepaper).
// This program is free software: redistribute/modify under the AGPL; it comes with
// NO WARRANTY. If you run a modified version over a network, the AGPL requires you to
// offer its complete source to users.

// core/memory/SemanticMemory.js
// Semantic Memory — semantic memory
//
// Stores "facts and concepts" rather than chronological conversation.
// e.g. "the user is interested in the semiconductor sector", "Samsung = ticker 005930".
// Reusing the same key updates it, and a confidence value is tracked alongside.

export class SemanticMemory {
  constructor(opts = {}) {
    /** @type {Map<string, { value:any, confidence:number, t:number }>} */
    this._facts = new Map();
    // Optional semantic index: when a SemanticRetriever is attached, asserted facts are also
    // embedded so they can be recalled by MEANING (not just exact key). Fully backward-
    // compatible — without a retriever, SemanticMemory behaves exactly as before.
    this._retriever = opts.retriever || null;
  }

  /** Attach (or replace) a semantic retriever for meaning-based recall. */
  attachRetriever(retriever) {
    this._retriever = retriever;
    return this;
  }

  /**
   * Store or update a fact.
   * @param {string} key
   * @param {any} value
   * @param {number} [confidence] 0~1
   */
  assert(key, value, confidence = 1) {
    if (!key) return null;
    const entry = {
      value,
      confidence: Math.max(0, Math.min(1, confidence)),
      t: Date.now(),
    };
    this._facts.set(key, entry);
    // mirror into the semantic index if attached (fire-and-forget; recall is best-effort)
    if (this._retriever) {
      const text = typeof value === 'string' ? `${key}: ${value}` : key;
      Promise.resolve(this._retriever.add(text, { key, value }, { id: key })).catch(() => {});
    }
    return entry;
  }

  /**
   * Recall facts by MEANING using the attached retriever (RAG-like). Falls back to an empty
   * list if no retriever is attached. Returns hits with their stored fact and similarity.
   * @param {string} queryText
   * @param {{ k?:number, minScore?:number }} [opts]
   * @returns {Promise<Array<{ key, value, score }>>}
   */
  async recall(queryText, opts = {}) {
    if (!this._retriever) return [];
    const hits = await this._retriever.query(queryText, opts);
    return hits.map((h) => ({ key: h.payload?.key ?? h.id, value: h.payload?.value, score: h.score }));
  }

  /** look up a fact (null if absent) */
  get(key) {
    return this._facts.get(key) ?? null;
  }

  has(key) {
    return this._facts.has(key);
  }

  forget(key) {
    return this._facts.delete(key);
  }

  /** list all facts */
  all() {
    return Array.from(this._facts.entries()).map(([key, e]) => ({ key, ...e }));
  }

  clear() {
    this._facts.clear();
  }
}
