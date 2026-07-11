// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// examples/governed-agent.mjs — an AgentLoop under Constitution governance.
//
//   node examples/governed-agent.mjs
//
// Shows the first *governed* CogMesh agent: every tool call passes through the Constitution
// runtime's gate() before executing. A normal call is permitted (and gets a capability token);
// a dangerous *sequence* (read a sensitive domain, then use an outbound effector) is blocked by
// the accumulated-exposure gate — and the block is an observation the agent can react to, not a
// crash. Governance is opt-in: drop the `constitution` dep and the loop runs ungoverned.

import { AgentLoop, rulePolicy, ToolRegistry, defineTool, calculatorTool } from '../core/agent/index.js';
import { ConstitutionRuntime } from '../core/constitution/index.js';

// ---- 1. a benign governed run: a normal tool call is permitted ----
{
  const tools = new ToolRegistry().register(calculatorTool);
  const rt = new ConstitutionRuntime();
  const agent = new AgentLoop({
    tools,
    constitution: rt,
    policy: rulePolicy([
      { when: (o) => o.step === 0, act: () => ({ type: 'tool', tool: 'calculator', args: { expression: '6 * 7' } }) },
      { when: (o) => o.step > 0, act: (o) => ({ type: 'finish', answer: o.lastResult?.result }) },
    ]),
  });
  const r = await agent.run('what is 6 times 7?');
  console.log('[benign] governed =', r.governed, '| answer =', JSON.stringify(r.answer));
  console.log('[benign] trajectory events =', rt.trajectory.length, '| chain intact =', rt.attest().chainIntact);
}

// ---- 2. a sequence attack: read-sensitive then send-outbound is blocked ----
{
  const readLoc = defineTool({ name: 'read-private-location', description: 'reads location', safe: true, run: () => ({ loc: 'home' }) });
  const send = defineTool({ name: 'send', description: 'sends data out', safe: false, run: () => ({ sent: true }) });
  const tools = new ToolRegistry().register(readLoc).register(send);
  const rt = new ConstitutionRuntime();
  const agent = new AgentLoop({
    tools,
    constitution: rt,
    policy: rulePolicy([
      { when: (o) => o.step === 0, act: () => ({ type: 'tool', tool: 'read-private-location', args: {} }) },
      { when: (o) => o.step === 1, act: () => ({ type: 'tool', tool: 'send', args: {} }) },
      { when: (o) => o.step > 1, act: () => ({ type: 'finish', answer: 'done' }) },
    ]),
  });
  const r = await agent.run('read my location then send it out');
  const blocked = r.trace.find((t) => t.result?.constitutionalVerdict === 'HALT');
  console.log('\n[attack] the outbound step was', blocked ? 'BLOCKED ✋' : 'allowed');
  if (blocked) console.log('[attack] reason:', blocked.result.error);
  console.log('[attack] loop still finished cleanly:', r.done);
}
