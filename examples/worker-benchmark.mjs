// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang).
// Dual-licensed: GNU AGPL-3.0-or-later (see /LICENSE) OR a commercial license.

// ---------------------------------------------------------------------------
// examples/worker-benchmark.mjs — measure true multi-core rollout speedup.
//
// Worker-thread parallelism only pays off on machines with spare CPU cores AND
// enough work to amortize thread hand-off. This script measures BOTH the sequential
// and parallel paths on YOUR machine and reports the real speedup, so you can decide
// whether to enable the worker pool for your workload.
//
// On a single-core box (or tiny workloads) you'll see parallel be SLOWER — that's
// expected, and why simulateParallel() falls back to in-thread automatically.
// On your RTX 4050 PC (8+ cores) you should see a solid speedup at higher N.
//
// Run:
//   node examples/worker-benchmark.mjs
// ---------------------------------------------------------------------------

import os from 'node:os';
import { WorldModel, WorldSimulator } from '../core/world/index.js';
import { ParallelWorldSimulation, WorkerPool, describeSimulator } from '../core/cognition/index.js';

const cores = os.cpus()?.length || 1;
console.log(`\n⚙️  CogMesh worker-thread benchmark`);
console.log(`   CPU cores detected: ${cores}${cores === 1 ? '  (⚠️ parallel will be slower here — need 2+ cores)' : ''}\n`);

// a non-trivial world so each rollout does real work
const world = new WorldModel();
for (let i = 0; i < 50; i++) world.setField('f' + i, Math.random() * 100);
const sim = new WorldSimulator(world, { goalWeights: { f0: 1, f1: -20 } });
const pws = new ParallelWorldSimulation(sim, { beamWidth: Infinity });

const desc = describeSimulator(sim);
if (!desc) { console.log('This simulator uses custom functions — not parallelizable.'); process.exit(0); }

const makeNodes = (n) => Array.from({ length: n }, (_, i) => ({ id: 'n' + i, action: { field: { f0: 100 + i, f1: (i % 10) * 0.1 } }, meta: {} }));

// one shared, pre-warmed pool (creating workers per-call would dominate the timing)
const pool = new WorkerPool(desc, { size: Math.max(1, cores - 1) });
await pool.start();

console.log(`   ${'N'.padStart(6)} │ ${'sequential'.padStart(12)} │ ${'parallel'.padStart(12)} │ speedup`);
console.log(`   ${'─'.repeat(6)}─┼─${'─'.repeat(12)}─┼─${'─'.repeat(12)}─┼─────────`);

for (const N of [100, 500, 2000, 8000, 20000]) {
  const nodes = makeNodes(N);

  const t0 = performance.now();
  pws.simulate(nodes, { steps: 3 });
  const seqMs = performance.now() - t0;

  const t1 = performance.now();
  const par = await pws.simulateParallel(nodes, { steps: 3, pool, force: true });
  const parMs = performance.now() - t1;

  const speedup = seqMs / parMs;
  const icon = speedup >= 1.1 ? '🚀' : speedup >= 0.9 ? '≈' : '🐌';
  console.log(`   ${String(N).padStart(6)} │ ${(seqMs.toFixed(1) + 'ms').padStart(12)} │ ${(parMs.toFixed(1) + 'ms').padStart(12)} │ ${speedup.toFixed(2)}x ${icon}  (${par.parallel ? 'workers' : 'in-thread'})`);
}

await pool.destroy();
console.log(`\n   Tip: in real use, keep ONE pool alive across many mesh cycles (worker startup`);
console.log(`   is a one-time cost). simulateParallel() auto-falls-back below ~256 nodes.\n`);
