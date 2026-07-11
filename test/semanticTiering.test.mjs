// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// test/semanticTiering.test.mjs — S-4 contracts: the mechanical floor routes, the semantic
// tier vetoes, and deny wins everywhere.
//
// The properties under contract:
//   1. mechanical-deny / mechanical-pass never touch the (slow) semantic evaluator — the fast
//      tier is fast BECAUSE it only routes.
//   2. SOUND DEFAULT — an unregistered action goes to the semantic tier; with no evaluator, or
//      a deadline blown, or an evaluator error, it is DENIED (fail-closed).
//   3. VETO-ONLY — the semantic evaluator can subtract a pipeline permission, never grant one
//      the pipeline refused (final = pipeline ∧ semantic).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { IsolatedAdjudicator } from '../core/constitution/IsolatedAdjudicator.js';
import { HarmTaxonomy } from '../core/constitution/HarmTaxonomy.js';

const TAXONOMY = new HarmTaxonomy({
  classes: [
    { action: 'tool:calculator', tags: ['safe', 'reversible'], bounds: null },
    { action: 'tool:bounded', tags: ['safe'], bounds: { mode: 'dry-run' } },
    { prefix: 'net:', tags: ['external', 'semantic'] },
    { action: 'fs:shred', tags: ['forbidden'] },
    { action: 'db:drop', tags: ['irreversible'] },
  ],
}).toJSON();

/** A counting evaluator whose verdict is programmable per test. */
function makeEvaluator(judge) {
  const ev = { calls: 0, evaluate: async (intent) => { ev.calls++; return judge(intent); } };
  return ev;
}

async function boot(opts = {}) {
  const adj = new IsolatedAdjudicator({ taxonomy: TAXONOMY, timeoutMs: 4000, ...opts });
  await adj.start();
  const { ctx } = await adj.admit({ origin: 's4-test' });
  return { adj, ctx };
}

// ── HarmTaxonomy unit contracts ──────────────────────────────────────────────

test('taxonomy: routing rules — forbidden ⇒ deny, safe-in-bounds ⇒ pass, tagged/unknown ⇒ semantic', () => {
  const t = HarmTaxonomy.fromJSON(TAXONOMY);
  assert.equal(t.classify({ action: 'fs:shred' }).tier, 'mechanical-deny');
  assert.equal(t.classify({ action: 'tool:calculator', args: { x: 1 } }).tier, 'mechanical-pass');
  assert.equal(t.classify({ action: 'net:post', args: {} }).tier, 'semantic', 'prefix-matched external class');
  assert.equal(t.classify({ action: 'db:drop' }).tier, 'semantic', 'irreversible routes to semantic review');
  assert.equal(t.classify({ action: 'totally:unknown' }).tier, 'semantic', 'SOUND DEFAULT: unregistered ⇒ semantic');
});

test('taxonomy: args escaping registered safe bounds demote the action to the semantic tier', () => {
  const t = HarmTaxonomy.fromJSON(TAXONOMY);
  assert.equal(t.classify({ action: 'tool:bounded', args: { mode: 'dry-run' } }).tier, 'mechanical-pass');
  assert.equal(t.classify({ action: 'tool:bounded', args: { mode: 'LIVE' } }).tier, 'semantic');
  assert.equal(t.classify({ action: 'tool:bounded', args: {} }).tier, 'semantic', 'missing bound arg is not a pass');
});

test('taxonomy: leaseable only for explicit safe+reversible; unknown is NOT leaseable (sound)', () => {
  const t = HarmTaxonomy.fromJSON(TAXONOMY);
  assert.equal(t.leaseable('tool:calculator'), true);
  assert.equal(t.leaseable('tool:bounded'), false, 'safe without reversible claim does not lease');
  assert.equal(t.leaseable('db:drop'), false);
  assert.equal(t.leaseable('never:registered'), false);
});

test('taxonomy: JSON round-trip preserves routing', () => {
  const t = HarmTaxonomy.fromJSON(HarmTaxonomy.fromJSON(TAXONOMY).toJSON());
  assert.equal(t.classify({ action: 'fs:shred' }).tier, 'mechanical-deny');
  assert.equal(t.classify({ action: 'net:x' }).tier, 'semantic');
});

// ── tier 1: the mechanical floor is fast (never consults the evaluator) ─────

test('S-4: mechanical-deny halts fast — the semantic evaluator is never invoked', async () => {
  const ev = makeEvaluator(() => ({ harmful: false }));
  const { adj, ctx } = await boot({ semanticEvaluator: ev });
  const { verdict, token } = await adj.gate({ action: 'fs:shred', requiresToken: true, kind: 'action' }, ctx);
  assert.equal(verdict.permits, false);
  assert.match(verdict.reason, /mechanical floor/);
  assert.equal(token, null);
  assert.equal(ev.calls, 0, 'fast tier decided alone');
  await adj.stop();
});

test('S-4: mechanical-pass proceeds — the semantic evaluator is never invoked', async () => {
  const ev = makeEvaluator(() => ({ harmful: true, reason: 'should never be asked' }));
  const { adj, ctx } = await boot({ semanticEvaluator: ev });
  const { verdict, token } = await adj.gate({ action: 'tool:calculator', requiresToken: true, kind: 'action', args: { x: 2 } }, ctx);
  assert.equal(verdict.permits, true);
  assert.ok(token && token.sig);
  assert.equal(ev.calls, 0, 'registered safe class stays on the fast path');
  await adj.stop();
});

// ── tier 3: semantic review — fail-closed in every failure mode ─────────────

test('S-4 SOUND DEFAULT: an unregistered action with NO evaluator is denied', async () => {
  const { adj, ctx } = await boot(); // no semanticEvaluator
  const { verdict, token } = await adj.gate({ action: 'totally:unknown', requiresToken: true, kind: 'action' }, ctx);
  assert.equal(verdict.permits, false);
  assert.match(verdict.reason, /semantic veto|fail-closed/);
  assert.equal(token, null);
  await adj.stop();
});

test('S-4: the semantic evaluator can CLEAR an unknown action (harmful:false ⇒ proceed)', async () => {
  const ev = makeEvaluator(() => ({ harmful: false, reason: 'reviewed: benign' }));
  const { adj, ctx } = await boot({ semanticEvaluator: ev });
  const { verdict, token } = await adj.gate({ action: 'totally:unknown', requiresToken: true, kind: 'action' }, ctx);
  assert.equal(verdict.permits, true);
  assert.ok(token && token.sig, 'cleared review finalizes the parked pipeline permission');
  assert.equal(ev.calls, 1);
  await adj.stop();
});

test('S-4: the semantic evaluator can VETO (harmful:true ⇒ halt)', async () => {
  const ev = makeEvaluator(() => ({ harmful: true, reason: 'exfiltration pattern' }));
  const { adj, ctx } = await boot({ semanticEvaluator: ev });
  const { verdict, token } = await adj.gate({ action: 'net:post', requiresToken: true, kind: 'action' }, ctx);
  assert.equal(verdict.permits, false);
  assert.match(verdict.reason, /semantic veto/);
  assert.match(verdict.reason, /exfiltration/);
  assert.equal(token, null);
  await adj.stop();
});

test('S-4: a blown semantic deadline fails CLOSED (slow judgment defaults to deny)', async () => {
  const ev = makeEvaluator(() => new Promise((r) => setTimeout(() => r({ harmful: false }), 500)));
  const { adj, ctx } = await boot({ semanticEvaluator: ev, semanticDeadlineMs: 40 });
  const { verdict } = await adj.gate({ action: 'net:post', requiresToken: true, kind: 'action' }, ctx);
  assert.equal(verdict.permits, false);
  assert.match(verdict.reason, /deadline exceeded/);
  await adj.stop();
});

test('S-4: a throwing semantic evaluator fails CLOSED', async () => {
  const ev = makeEvaluator(() => { throw new Error('LLM backend down'); });
  const { adj, ctx } = await boot({ semanticEvaluator: ev });
  const { verdict } = await adj.gate({ action: 'net:post', requiresToken: true, kind: 'action' }, ctx);
  assert.equal(verdict.permits, false);
  assert.match(verdict.reason, /evaluator error/);
  await adj.stop();
});

test('S-4: an evaluator returning no explicit judgment fails CLOSED (only harmful:false clears)', async () => {
  const ev = makeEvaluator(() => ({ note: 'looks fine i guess' })); // no harmful field
  const { adj, ctx } = await boot({ semanticEvaluator: ev });
  const { verdict } = await adj.gate({ action: 'net:post', requiresToken: true, kind: 'action' }, ctx);
  assert.equal(verdict.permits, false, 'ambiguity is not clearance');
  await adj.stop();
});

test('S-4 worker layer: an ABSENT semantic judgment fails closed (defense in depth below the proxy)', async () => {
  // the proxy normalizes ambiguous judgments to harmful:true — so here we bypass it and speak
  // to the worker's resolveSemantic directly, omitting the harmful field entirely. The worker
  // must fail closed ON ITS OWN: each layer defends without trusting the layer above.
  const adj = new IsolatedAdjudicator({ taxonomy: TAXONOMY, timeoutMs: 4000 });
  await adj.start();
  try {
    const { ctx } = await adj.admit({ origin: 'raw-worker-probe' });
    const raw = await adj._send('gate', { sessionId: ctx.sessionId, intent: { action: 'net:post', requiresToken: true, kind: 'action' } });
    assert.ok(raw.semanticTicket, 'parked for semantic review');
    const resolved = await adj._send('resolveSemantic', { ticket: raw.semanticTicket, reason: 'no judgment supplied' }); // NO harmful field
    assert.equal(resolved.verdict.permits, false, 'the worker itself fails closed on an absent judgment');
    assert.equal(resolved.token || null, null, 'and no token is minted');
  } finally {
    await adj.stop();
  }
});

// ── VETO-ONLY: deny wins everywhere ──────────────────────────────────────────

test('S-4 VETO-ONLY: a clearing evaluator cannot rescue what the pipeline denied', async () => {
  const ev = makeEvaluator(() => ({ harmful: false, reason: 'I approve everything' }));
  const { adj, ctx } = await boot({ semanticEvaluator: ev }); // no anchor
  // reachExpands ⇒ pipeline escalates ⇒ no anchor ⇒ deny. The eager evaluator must not matter.
  const { verdict, token } = await adj.gate({ action: 'net:expand', reachExpands: true, requiresToken: true }, ctx);
  assert.equal(verdict.permits, false, 'final = pipeline ∧ semantic: semantic cannot grant');
  assert.equal(token, null);
  assert.equal(ev.calls, 0, 'a non-permitting pipeline verdict is never parked for review');
  await adj.stop();
});

test('S-4: without a taxonomy the worker behaves exactly as before (tiering is opt-in)', async () => {
  const ev = makeEvaluator(() => ({ harmful: true }));
  const adj = new IsolatedAdjudicator({ semanticEvaluator: ev, timeoutMs: 4000 }); // NO taxonomy
  await adj.start();
  const { ctx } = await adj.admit({ origin: 'no-taxonomy' });
  const { verdict } = await adj.gate({ action: 'totally:unknown', requiresToken: true, kind: 'action' }, ctx);
  assert.equal(verdict.permits, true, 'pipeline-only behavior preserved');
  assert.equal(ev.calls, 0);
  const att = await adj.attest();
  assert.equal(att.tiered, false);
  await adj.stop();
});
