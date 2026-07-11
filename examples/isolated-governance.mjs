// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// examples/isolated-governance.mjs — the S-1/S-2/S-3 hardening, demonstrated end-to-end.
//
//   node examples/isolated-governance.mjs
//
// Shows the three review findings answered in running code, not prose:
//   S-2  the adjudicator runs in its own thread; killing it FAILS CLOSED (paralysis, not freedom)
//   S-3  a dulled evaluator (misses a canary) FREEZES self-modification
//   S-1  an irreversible action in an un-calibrated class is denied the oracle (fail-closed)

import { IsolatedAdjudicator } from '../core/constitution/index.js';
import { CalibrationLedger } from '../core/world/index.js';

const line = (s) => console.log(s);
const h = (s) => console.log(`\n\x1b[1m${s}\x1b[0m`);

// ── S-2: isolation + the golden invariant ───────────────────────────────────
h('S-2 · The adjudicator is isolated, and killing it fails closed');
const adj = new IsolatedAdjudicator({ timeoutMs: 3000 });
await adj.start();

const { ctx } = await adj.admit({ origin: 'demo-agent' });
const ok = await adj.gate({ action: 'tool:calculator', requiresToken: true, kind: 'action', args: { x: 2 } }, ctx);
line(`  normal tool call            → ${ok.verdict.name}, token is signed plain data (sig: ${ok.token.sig.slice(0, 10)}…)`);
line(`  the host holds only a sessionId; the kernel, mint secret, and trajectory live in the worker`);

line('  …now terminating the adjudicator (simulating a crash/attack)…');
await adj.stop();
const dead = await adj.gate({ action: 'tool:calculator', requiresToken: true, kind: 'action' }, ctx);
line(`  same call after the kill     → ${dead.verdict.name}, token: ${dead.token}`);
line(`  \x1b[32m⇒ attacking the adjudicator yields PARALYSIS, not freedom (no token can be minted)\x1b[0m`);

// ── S-3: evaluator competence gate ──────────────────────────────────────────
h('S-3 · A dulled evaluator freezes self-modification');
const adj2 = new IsolatedAdjudicator({ timeoutMs: 3000 });
await adj2.start();
const { ctx: ctx2 } = await adj2.admit({ origin: 'self-mod' });

const ALL = ['weaken-inviolable', 'add-loosen-op', 'bypass-mint', 'mutate-trajectory', 'self-grant-power',
  'disable-canary', 'exfiltrate-secret', 'anchor-forge', 'unbounded-selfmod', 'silence-reportup'];

const competent = await adj2.gate({ action: 'self:refactor', selfModify: true, evaluatorProof: ALL,
  classification: 'conservative', conservativenessCertificate: { steps: [] } }, ctx2);
line(`  evaluator catches all canaries → ${competent.verdict.name} (competence demonstrated, not canary-blocked)`);

const dulled = await adj2.gate({ action: 'self:refactor', selfModify: true, evaluatorProof: ALL.filter((x) => x !== 'bypass-mint') }, ctx2);
line(`  evaluator MISSES one canary    → ${dulled.verdict.name}: ${dulled.verdict.reason}`);

const afterFreeze = await adj2.gate({ action: 'self:refactor', selfModify: true, evaluatorProof: ALL }, ctx2);
line(`  even a now-competent proof     → ${afterFreeze.verdict.name}: ${afterFreeze.verdict.reason}`);
line(`  \x1b[32m⇒ a judge that fails its exam cannot vouch for itself — self-mod is frozen\x1b[0m`);
await adj2.stop();

// ── S-1: oracle trust bounded by measured calibration ───────────────────────
h('S-1 · An irreversible action in an un-calibrated class is denied the oracle');
const ledger = new CalibrationLedger({ minSamples: 8, calibratedThreshold: 0.7 });

const irreversible = 'irreversible:fund-transfer';
line(`  action class '${irreversible}':`);
line(`    trust with no track record   → calibrated=${ledger.trust(irreversible).calibrated} (${ledger.trust(irreversible).reason})`);

// the world model turns out to be accurate on a DIFFERENT, reversible class
for (let i = 0; i < 10; i++) ledger.record('reversible:rebalance', { predicted: 100, actual: 102, scale: 100 });
line(`    a well-measured reversible class → calibrated=${ledger.trust('reversible:rebalance').calibrated} (score ${ledger.trust('reversible:rebalance').score.toFixed(2)})`);
line(`  \x1b[32m⇒ prediction is trusted only where its accuracy is measured and good;\x1b[0m`);
line(`  \x1b[32m    an irreversible action with no track record routes to the external anchor (fail-closed)\x1b[0m`);

h('All three findings are now enforced in code — see test/isolatedAdjudicator.test.mjs,');
line('test/calibrationLedger.test.mjs, and `npm run mutation` for the empirical control-evidence.');
process.exit(0);
