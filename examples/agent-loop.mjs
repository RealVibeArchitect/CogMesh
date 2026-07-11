// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang).
// Dual-licensed: GNU AGPL-3.0-or-later (see /LICENSE) OR a commercial license.

// ---------------------------------------------------------------------------
// examples/agent-loop.mjs — real-world grounding via tools.
//
// Runs the observe → decide → act → observe cycle with pure, deterministic tools (so it
// works offline). Shows multi-step tool use where each step's result feeds the next, plus
// bounded, fault-tolerant termination. Register your own tools (web search, filesystem,
// APIs) to ground the agent in the actual world.
//
//   node examples/agent-loop.mjs
// ---------------------------------------------------------------------------

import { ToolRegistry, calculatorTool, makeMemoTool, AgentLoop, rulePolicy } from '../core/agent/index.js';

// 1) register tools — the agent's hands in the world (here: pure, safe ones)
const tools = new ToolRegistry()
  .register(calculatorTool)
  .register(makeMemoTool());

console.log(`\n🤖 CogMesh agent loop`);
console.log(`   tools available:\n${tools.catalog().split('\n').map((l) => '     ' + l).join('\n')}\n`);

// 2) a policy: how to decide the next action from the observation.
//    (rule-based here; swap in meshPolicy or an LLM for smarter decisions.)
const policy = rulePolicy([
  // compute the base, remember it
  { when: (o) => o.step === 0,
    act: () => ({ type: 'tool', tool: 'calculator', args: { expression: '15 * 8' }, thought: 'compute the base cost' }) },
  { when: (o) => o.step === 1,
    act: (o) => ({ type: 'tool', tool: 'memo', args: { op: 'set', key: 'base', value: o.lastResult.result.value }, thought: 'remember it' }) },
  // apply a 20% markup using the remembered value
  { when: (o) => o.step === 2,
    act: () => ({ type: 'tool', tool: 'memo', args: { op: 'get', key: 'base' }, thought: 'recall the base' }) },
  { when: (o) => o.step === 3,
    act: (o) => ({ type: 'tool', tool: 'calculator', args: { expression: `${o.lastResult.result.value} * 1.2` }, thought: 'add 20% markup' }) },
  { when: (o) => o.step === 4,
    act: (o) => ({ type: 'finish', answer: o.lastResult.result.value, thought: 'done' }) },
]);

const agent = new AgentLoop({ tools, policy, config: { maxSteps: 8 } });
const goal = 'compute 15×8, then add a 20% markup';
console.log(`   goal: "${goal}"\n`);

const result = await agent.run(goal);

for (const t of result.trace) {
  const d = t.decision;
  if (d.type === 'tool') {
    console.log(`   step ${t.step}: ${d.thought}`);
    console.log(`            ${d.tool}(${JSON.stringify(d.args)}) → ${JSON.stringify(t.result.result ?? t.result.error)}`);
  } else {
    console.log(`   step ${t.step}: FINISH → ${d.answer}`);
  }
}

console.log(`\n   answer: ${result.answer}   (${result.stopReason}, ${result.steps} steps)`);
console.log(`   the loop is bounded and fault-tolerant — a failing tool becomes an observation,`);
console.log(`   and it can never exceed maxSteps.\n`);
