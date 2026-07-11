// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang).
// Dual-licensed: GNU AGPL-3.0-or-later (see /LICENSE) OR a commercial license
// (see /COMMERCIAL-LICENSE.md). The PAD formulae, coordinate values, and algorithms
// herein are original works of the author (see the CogMesh Technical Whitepaper).
// This program is free software: redistribute/modify under the AGPL; it comes with
// NO WARRANTY. If you run a modified version over a network, the AGPL requires you to
// offer its complete source to users.

// engines/finance/index.js
// Example Finance engine (a stub to demonstrate the interface)
//
// A real implementation would fetch market data, call an LLM, etc. inside run().
// Here we only show the interface that connects to the core.

export const financeEngine = {
  id: 'finance',
  name: 'Finance Engine (example)',
  version: 'v1-example',

  canHandle(input) {
    const hit = /주가|종목|주식|stock|ticker|금리|환율|코스피/i.test(input || '');
    return { canHandle: hit, confidence: hit ? 0.8 : 0, detail: {} };
  },

  async run(input, _ctx = {}) {
    // TODO: wire in real financial-analysis logic. _ctx.budget.maxTokens is available, etc.
    return {
      engine: 'finance',
      note: 'example stub — wire your real analysis logic here.',
      input,
    };
  },

  review(input) {
    const hit = /주가|종목|금리/i.test(input || '');
    return hit
      ? { relevance: 0.6, note: 'Consider the market context from a financial angle.', flags: ['finance'] }
      : { relevance: 0, note: null, flags: [] };
  },
};

export default financeEngine;
