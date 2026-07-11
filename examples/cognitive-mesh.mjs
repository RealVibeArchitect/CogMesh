// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang).
// Dual-licensed: GNU AGPL-3.0-or-later (see /LICENSE) OR a commercial license
// (see /COMMERCIAL-LICENSE.md). Example: the Brain-like Parallel Cognitive Mesh.

// ---------------------------------------------------------------------------
// examples/cognitive-mesh.mjs — run the full generate → decompose → simulate →
// evaluate/debate → conflict → synthesize → regenerate → self-improve loop.
//
// It uses the World Model + WorldSimulator as the "imagination" the mesh thinks in,
// and prints, cycle by cycle, what the mesh considered and how its thought-graph
// wired itself together. No external LLM needed — the whole loop is local.
//
// Run:
//   node examples/cognitive-mesh.mjs
//   node examples/cognitive-mesh.mjs "grow the portfolio without taking on risk"
// ---------------------------------------------------------------------------

import { WorldModel, WorldSimulator } from '../core/world/index.js';
import { CognitiveMesh, ResourceManager } from '../core/cognition/index.js';

const goal = process.argv.slice(2).join(' ') || 'grow the portfolio while keeping risk low';

// 1) the world the mesh imagines in — a tiny portfolio state
const world = new WorldModel();
world.setField('wealth', 100);
world.setField('risk', 0.3);

// 2) how good is an imagined future? more wealth good, more risk bad.
const simulator = new WorldSimulator(world, { goalWeights: { wealth: 1, risk: -25 } });

// 3) an optional PAD stance the emotion-evaluator will read (exploratory here)
const padCoord = { p: 0.2, a: 0.6, d: 0.1 };

// 4) build the mesh
const mesh = new CognitiveMesh({
  simulator,
  wiring: { getPadCoord: () => padCoord },
  resources: new ResourceManager({ maxRollouts: 400, maxCycles: 6 }),
  config: { beamWidth: 10, steps: 1 },
});

console.log(`\n🧠 CogMesh — Brain-like Parallel Cognitive Mesh`);
console.log(`goal: "${goal}"\n`);

const result = mesh.run(goal);

// which reasoning strategy the meta-reasoner chose for this situation
if (result.strategy) {
  console.log(`🧭 reasoning strategy: ${result.strategy.rationale}\n`);
}

// which perspectives attention chose to focus on for this goal
if (mesh._recentFocus?.length) {
  console.log(`🎯 attended perspectives: ${mesh._recentFocus.join(', ')}  (the rest were pruned to save compute)\n`);
}

// per-cycle trace
result.cycles.forEach((c, i) => {
  const top = c.best;
  console.log(`─ cycle ${i + 1} ─ admitted ${c.admitted} nodes, pruned ${c.pruned}, ${c.syntheses.length} synthesis`);
  if (top) {
    console.log(`   winner: ${top.label || top.id} (lens=${top.lens})  council=${top.councilScore.toFixed(2)}  agreement=${(top.agreement * 100 | 0)}%`);
    if (top.summary?.strengths[0]) console.log(`   +  ${top.summary.strengths[0].text} (${top.summary.strengths[0].from})`);
    if (top.summary?.weaknesses[0]) console.log(`   -  ${top.summary.weaknesses[0].text} (${top.summary.weaknesses[0].from})`);
  }
});

console.log(`\n✔ stopped: ${result.stopReason}`);
console.log(`  best council score: ${result.bestScore.toFixed(2)}`);
console.log(`  thought-mesh: ${result.mesh.nodes.length} nodes, ${result.mesh.edges.length} weighted links`);
console.log(`  resources: ${result.resources.spentRollouts} rollouts over ${result.resources.cycles} cycles (${result.resources.elapsedMs}ms)`);

// self-improvement stability: how the best score evolved, and whether any poison was caught
if (result.stability) {
  const s = result.stability;
  console.log(`  stability: trend=${s.trend}, trajectory ${s.trajectory.map((v) => v.toFixed(1)).join(' → ')}`
    + (s.poisonedDropped ? `, isolated ${s.poisonedDropped} poisoned candidate(s)` : ''));
}

// cache-based incremental reasoning: how much compute the memoization saved
const cs = mesh.simulator.stats?.();
if (cs) {
  console.log(`  rollout cache: ${(cs.hitRate * 100).toFixed(1)}% hit-rate `
    + `(${cs.hits} hits / ${cs.misses} real sims) — most futures were reused, not recomputed`);
}

// the top few links the mesh strengthened (which perspectives corroborated each other)
const strongest = [...result.mesh.edges].sort((a, b) => b.weight - a.weight).slice(0, 5);
if (strongest.length) {
  console.log(`\n  strongest thought-links (perspectives that wired together):`);
  for (const e of strongest) console.log(`    ${e.a} ↔ ${e.b}   w=${e.weight}`);
}

console.log(`\n  reality untouched — wealth is still ${world.getField('wealth')} (the mesh only imagined).\n`);
