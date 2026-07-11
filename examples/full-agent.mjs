// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang).
// Dual-licensed: GNU AGPL-3.0-or-later (see /LICENSE) OR a commercial license.

// ---------------------------------------------------------------------------
// examples/full-agent.mjs — the whole CogMesh, working as one.
//
// Assembles every subsystem into one CogMeshAgent and runs the complete cognitive cycle
// twice, so you can watch the LEARN→RECALL loop close: what the agent learns on run 1
// becomes context it recalls on run 2. This is the payoff of all the pieces — perception,
// memory, reasoning, action, and stability composing into a single mind-like loop.
//
//     PERCEIVE → REMEMBER → ORIENT → THINK → ACT → LEARN → (recall next time)
//
// Runs fully offline (lexical embeddings, pure tools). Swap in the MiniLM ONNX embedder and
// real tools to ground it in the actual world.
//
//   node examples/full-agent.mjs
// ---------------------------------------------------------------------------

import { WorldModel, WorldSimulator } from '../core/world/index.js';
import { CognitiveMesh, ResourceManager } from '../core/cognition/index.js';
import { createEmbeddingProvider, SemanticRetriever } from '../core/retrieval/index.js';
import { ToolRegistry, calculatorTool, makeMemoTool, AgentLoop, rulePolicy } from '../core/agent/index.js';
import { PixelFeatureEncoder } from '../core/multimodal/index.js';
import { CogMeshAgent } from '../core/CogMeshAgent.js';

// ── assemble the mind ────────────────────────────────────────────────────
const world = new WorldModel();
world.setField('wealth', 100);
world.setField('risk', 0.3);
const mesh = new CognitiveMesh({
  simulator: new WorldSimulator(world, { goalWeights: { wealth: 1, risk: -20 } }),
  resources: new ResourceManager({ maxRollouts: 100000, maxCycles: 5 }),
});

const { provider } = await createEmbeddingProvider();          // memory (MiniLM if exported)
const retriever = new SemanticRetriever(provider);

const tools = new ToolRegistry().register(calculatorTool).register(makeMemoTool());
const agent = new AgentLoop({
  tools,
  policy: rulePolicy([
    { when: (o) => o.step === 0, act: () => ({ type: 'tool', tool: 'calculator', args: { expression: '100 * 1.15' }, thought: 'project a 15% gain' }) },
    { when: (o) => o.step === 1, act: (o) => ({ type: 'finish', answer: o.lastResult.result.value }) },
  ]),
});

const cog = new CogMeshAgent({
  mesh,
  retriever,
  agent,
  imageEncoder: new PixelFeatureEncoder(),
  config: { recallK: 3 },
});

console.log(`\n🧠 CogMesh — full cognitive agent`);
console.log(`   subsystems: perception · memory · reasoning · action · stability\n`);

function report(label, r) {
  console.log(`━━ ${label} ━━`);
  console.log(`   goal      : "${r.goal}"`);
  console.log(`   perceive  : ${r.trace.stages.perceive.modality}`);
  const rec = r.trace.stages.remember.recalled;
  console.log(`   remember  : ${rec.length ? rec.map((m) => `"${m.text}" (${m.score})`).join(', ') : '(nothing yet)'}`);
  console.log(`   orient    : strategy = ${r.strategy?.name}`);
  console.log(`   think     : best score ${r.bestScore.toFixed(1)}  ·  stability ${r.stability?.trend}`);
  if (r.answer !== null) console.log(`   act       : tool answer = ${r.answer}`);
  console.log(`   learn     : ${r.trace.stages.learn.stored ? `stored "${r.trace.stages.learn.text}"` : 'not stored'}`);
  console.log('');
}

// ── run 1: nothing to recall yet; it thinks, acts, and LEARNS ────────────
const scene = { width: 8, height: 8, data: new Uint8ClampedArray(8 * 8 * 4).fill(180) };
const r1 = await cog.run('포트폴리오를 안전하게 키우기', { image: scene, act: true });
report('run 1  (first encounter)', r1);

// ── run 2: a related goal — now it RECALLS what it learned ────────────────
const r2 = await cog.run('자산을 안전하게 늘리는 전략', { act: true });
report('run 2  (loop closes)', r2);

console.log('✔ the LEARN→RECALL loop is closed: run 2 recalled what run 1 learned.');
console.log('  experience changes future cognition — a loop, not a pipeline.\n');
