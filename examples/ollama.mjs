// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang).
// Dual-licensed: GNU AGPL-3.0-or-later (see /LICENSE) OR a commercial license
// (see /COMMERCIAL-LICENSE.md). Example: connect CogMesh to a local Ollama LLM.

// ---------------------------------------------------------------------------
// examples/ollama.mjs — CogMesh + Ollama (fully local, free, private)
//
// Prereqs:
//   1. Install Ollama:      https://ollama.com
//   2. Pull a model:        ollama pull llama3
//   3. Ollama runs at:      http://localhost:11434
//
// Run:
//   node examples/ollama.mjs "Explain gradient descent simply"
// ---------------------------------------------------------------------------

import { EngineRegistry } from '../core/mesh/EngineRegistry.js';
import { MeshRouter } from '../core/mesh/MeshRouter.js';
import { reflect } from '../core/pad/index.js';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL || 'llama3';

// Call a local Ollama model. `maxTokens` comes from CogMesh's Bounded Rationality.
async function callOllama(prompt, maxTokens = 400) {
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      stream: false,
      options: { num_predict: maxTokens },
    }),
  });
  if (!res.ok) throw new Error(`Ollama error ${res.status} — is Ollama running? (ollama serve)`);
  return (await res.json()).response.trim();
}

// Register a single general engine backed by Ollama.
const registry = new EngineRegistry();
registry.register('general', {
  id: 'general',
  canHandle: () => ({ canHandle: true, confidence: 0.6 }),
  // MeshRouter passes ctx = { lang, budget, transformedInput, ... }
  run: async (input, ctx = {}) => {
    // CogMesh has already framed the input with its cognitive state (transformedInput),
    // and decided a compute budget. We simply respect both.
    const prompt = ctx.transformedInput || input;
    const maxTokens = ctx?.budget?.maxTokens ?? 400;
    return callOllama(prompt, maxTokens);
  },
});

const mesh = new MeshRouter(registry);

async function main() {
  const input = process.argv.slice(2).join(' ') || 'Give me one tip to focus better.';

  // (optional) show CogMesh's metacognitive stance for this request
  const stance = reflect([{ id: 'curious', weight: 0.7 }, { id: 'proud', weight: 0.3 }]);
  console.log('🧠 cognitive stance:', stance.selfReport, '\n');

  // route → the general (Ollama) engine runs, with metacognition + budget applied
  const result = await mesh.route(input, { lang: 'en' });

  console.log('💬 input :', input);
  console.log('🤖 output:', typeof result === 'string' ? result : JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error('❌', e.message);
  console.error('   Tip: run `ollama serve` and `ollama pull llama3` first.');
  process.exit(1);
});
