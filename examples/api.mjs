// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang).
// Dual-licensed: GNU AGPL-3.0-or-later (see /LICENSE) OR a commercial license
// (see /COMMERCIAL-LICENSE.md). Example: connect CogMesh to a commercial LLM API.

// ---------------------------------------------------------------------------
// examples/api.mjs — CogMesh + a commercial API (OpenAI-compatible)
//
// Works with any OpenAI-compatible /chat/completions endpoint
// (OpenAI, Groq, Together, local vLLM, etc.). Set env vars:
//
//   export LLM_API_KEY="sk-..."
//   export LLM_BASE_URL="https://api.openai.com/v1"   # or your provider
//   export LLM_MODEL="gpt-4o-mini"
//
// Run:
//   node examples/api.mjs "Summarize the CAP theorem in 3 lines"
// ---------------------------------------------------------------------------

import { EngineRegistry } from '../core/mesh/EngineRegistry.js';
import { MeshRouter } from '../core/mesh/MeshRouter.js';

const BASE_URL = process.env.LLM_BASE_URL || 'https://api.openai.com/v1';
const API_KEY  = process.env.LLM_API_KEY;
const MODEL    = process.env.LLM_MODEL || 'gpt-4o-mini';

async function callAPI(prompt, maxTokens = 400) {
  if (!API_KEY) throw new Error('Set LLM_API_KEY (and optionally LLM_BASE_URL / LLM_MODEL).');
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,               // respect CogMesh's Bounded Rationality budget
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return (await res.json()).choices[0].message.content.trim();
}

const registry = new EngineRegistry();

// A finance engine that only raises its hand for market questions...
registry.register('finance', {
  id: 'finance',
  canHandle: (t) => ({ canHandle: /stock|ticker|market|주가|종목/i.test(t), confidence: 0.9 }),
  run: async (input, ctx = {}) =>
    callAPI(`You are a careful financial analyst.\n\n${ctx.transformedInput || input}`,
            ctx?.budget?.maxTokens ?? 500),
});

// ...and a general engine for everything else.
registry.register('general', {
  id: 'general',
  canHandle: () => ({ canHandle: true, confidence: 0.5 }),
  run: async (input, ctx = {}) =>
    callAPI(ctx.transformedInput || input, ctx?.budget?.maxTokens ?? 400),
});

const mesh = new MeshRouter(registry);

async function main() {
  const input = process.argv.slice(2).join(' ') || 'Is now a good time to think about index funds?';

  // See who the mesh would pick (routing preview, no API call)
  console.log('🕸️  candidates:', mesh.poll(input).map((c) => `${c.id}(${c.confidence})`).join(', '), '\n');

  const result = await mesh.route(input, { lang: 'en' });
  console.log('💬 input :', input);
  console.log('🤖 output:', typeof result === 'string' ? result : JSON.stringify(result, null, 2));
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
