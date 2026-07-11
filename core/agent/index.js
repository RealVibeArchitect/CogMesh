// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/agent/index.js — real-world grounding via tools and an agent loop.
//
//   - Tool / ToolRegistry / defineTool   the boundary to the real world (side effects live here)
//   - built-in safe tools (calculator, memo)   pure tools for tests & simple agents
//   - AgentLoop                          observe → decide → act → observe, bounded & fault-tolerant
//   - rulePolicy                         a deterministic policy seam (LLM/mesh plug in here)

export {
  defineTool,
  ToolRegistry,
  calculatorTool,
  makeMemoTool,
  evalArithmetic,
} from './Tool.js';
export { AgentLoop, rulePolicy } from './AgentLoop.js';
export { meshPolicy, meshDecider } from './meshPolicy.js';
