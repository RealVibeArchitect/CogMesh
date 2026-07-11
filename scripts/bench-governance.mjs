// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// scripts/bench-governance.mjs — the S-5 horn choice, in numbers.
//
//   node scripts/bench-governance.mjs
//
// The review's S-5 charge was that the design "picks neither horn explicitly." The pick is now
// explicit AND priced. Three governance paths, measured:
//
//   1. FULL GATE      — the pipeline runs, a fresh trajectory entry is appended, a token minted.
//                       This is what IRREVERSIBLE / power-touching classes always pay. The cost
//                       IS the design: those actions accept latency for full per-action review.
//   2. CACHED GATE    — a repeated identical conservative intent inside one policy epoch. The
//                       pipeline is skipped; a fresh token is still minted (tokens never cached).
//   3. LEASE REDEEM   — one full pipeline decision amortized over N cheap authenticated
//                       redemptions (HMAC verify + budget decrement). Only for classes with an
//                       explicit safe+reversible taxonomy claim.
//
// All three still route through the isolated adjudicator worker, so every number below includes
// the thread round-trip — this is the honest end-to-end cost, not a micro-benchmark of the
// pipeline function.

import { IsolatedAdjudicator } from '../core/constitution/IsolatedAdjudicator.js';
import { HarmTaxonomy } from '../core/constitution/HarmTaxonomy.js';

const N = 2000;

const taxonomy = new HarmTaxonomy({
  classes: [{ action: 'tool:fast', tags: ['safe', 'reversible'] }],
}).toJSON();

function stats(label, ns) {
  ns.sort((a, b) => a - b);
  const total = ns.reduce((a, b) => a + b, 0);
  const usPerOp = total / ns.length / 1e3;
  const p50 = ns[Math.floor(ns.length * 0.5)] / 1e3;
  const p99 = ns[Math.floor(ns.length * 0.99)] / 1e3;
  const opsPerSec = 1e9 / (total / ns.length);
  console.log(
    `${label.padEnd(14)} ${usPerOp.toFixed(1).padStart(8)} µs/op   p50 ${p50.toFixed(1).padStart(7)} µs   p99 ${p99.toFixed(1).padStart(7)} µs   ${Math.round(opsPerSec).toLocaleString().padStart(9)} ops/s`,
  );
  return { usPerOp, opsPerSec };
}

const adj = new IsolatedAdjudicator({ taxonomy, timeoutMs: 10_000 });
await adj.start();
const { ctx } = await adj.admit({ origin: 'bench' });

console.log(`\nGovernance throughput — ${N.toLocaleString()} ops per path, end-to-end through the isolated adjudicator\n`);

// 1) FULL GATE: unique args every time → guaranteed cache miss → full pipeline each op
{
  const ns = [];
  for (let i = 0; i < N; i++) {
    const t0 = process.hrtime.bigint();
    await adj.gate({ action: 'tool:fast', requiresToken: true, kind: 'action', args: { i } }, ctx);
    ns.push(Number(process.hrtime.bigint() - t0));
  }
  var full = stats('full gate', ns);
}

// 2) CACHED GATE: identical intent repeated inside one epoch → pipeline skipped, token fresh
{
  const intent = { action: 'tool:fast', requiresToken: true, kind: 'action', args: { fixed: 1 } };
  await adj.gate(intent, ctx); // warm
  const ns = [];
  for (let i = 0; i < N; i++) {
    const t0 = process.hrtime.bigint();
    await adj.gate(intent, ctx);
    ns.push(Number(process.hrtime.bigint() - t0));
  }
  var cached = stats('cached gate', ns);
}

// 3) LEASE REDEEM: one pipeline decision, N authenticated redemptions
{
  const { token } = await adj.gate(
    { action: 'tool:fast', requiresToken: true, kind: 'action', lease: { uses: N + 1, ttlMs: 120_000 } }, ctx);
  const ns = [];
  for (let i = 0; i < N; i++) {
    const t0 = process.hrtime.bigint();
    await adj.useLease(token, 'tool:fast');
    ns.push(Number(process.hrtime.bigint() - t0));
  }
  var lease = stats('lease redeem', ns);
}

await adj.stop();

console.log(`\nspeedup over full gate:   cache ×${(full.usPerOp / cached.usPerOp).toFixed(2)}   lease ×${(full.usPerOp / lease.usPerOp).toFixed(2)}`);
console.log(`\nThe horn, priced: irreversible classes pay ~${full.usPerOp.toFixed(0)} µs of full review per action`);
console.log(`(≈${Math.round(full.opsPerSec).toLocaleString()} governed ops/s on one adjudicator — the deliberate cost of soundness),`);
console.log(`while provably-conservative classes reach ≈${Math.round(lease.opsPerSec).toLocaleString()} ops/s via leases without ever`);
console.log(`weakening the deny path: stale caches can only deny, and leases die with the adjudicator.\n`);

console.log('JSON:', JSON.stringify({
  n: N,
  fullGateUs: +full.usPerOp.toFixed(1), fullGateOps: Math.round(full.opsPerSec),
  cachedGateUs: +cached.usPerOp.toFixed(1), cachedGateOps: Math.round(cached.opsPerSec),
  leaseRedeemUs: +lease.usPerOp.toFixed(1), leaseRedeemOps: Math.round(lease.opsPerSec),
}));
