// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// test/scalability.test.mjs — S-5 contracts: the throughput horns are explicit and STILL sound.
//
// The whole point of S-5 is that we did NOT pick "async/cached ⇒ soundness hole." Both shortcuts
// are asymmetric — they can only ever DENY more, never ALLOW more:
//   • VerdictCache: a stale ALLOW is impossible (epoch-gated); a stale DENY is fine (sound).
//   • Leases: granted only for provably reversible+safe classes; a dead adjudicator can't redeem.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { IsolatedAdjudicator } from '../core/constitution/IsolatedAdjudicator.js';
import { HarmTaxonomy } from '../core/constitution/HarmTaxonomy.js';
import { VerdictCache, verdictCacheKey } from '../core/constitution/VerdictCache.js';

const TAXONOMY = new HarmTaxonomy({
  classes: [
    { action: 'tool:calculator', tags: ['safe', 'reversible'] },
    { action: 'tool:readonly', tags: ['safe', 'reversible'] },
    { action: 'db:drop', tags: ['irreversible'] },
  ],
}).toJSON();

// ── VerdictCache unit contracts: the ALLOW/DENY asymmetry ───────────────────

test('cache: an ALLOW hit requires the CURRENT epoch; a bump invalidates it', () => {
  const c = new VerdictCache({ allowTtlMs: 10_000 });
  const allow = { name: 'PROCEED', permits: true, reason: 'ok' };
  c.put('k', allow, 5);
  assert.deepEqual(c.get('k', 5), allow, 'same epoch → hit');
  assert.equal(c.get('k', 6), null, 'epoch bumped → ALLOW is gone');
});

test('cache: a DENY hit survives epoch bumps (denying more is always sound)', () => {
  const c = new VerdictCache({ denyTtlMs: 10_000 });
  const deny = { name: 'HALT', permits: false, reason: 'no' };
  c.put('k', deny, 5);
  assert.deepEqual(c.get('k', 9999), deny, 'a deny under any past epoch is still a sound deny');
});

test('cache: entries expire on their TTL', () => {
  const c = new VerdictCache({ allowTtlMs: 50 });
  const allow = { name: 'PROCEED', permits: true };
  const t0 = 1_000_000;
  c.put('k', allow, 1, t0);
  assert.deepEqual(c.get('k', 1, t0 + 10), allow);
  assert.equal(c.get('k', 1, t0 + 60), null, 'past TTL → miss');
});

test('cache: the key separates intents by accumulated exposure (verdicts are exposure-dependent)', () => {
  const base = { action: 'tool:x', args: { a: 1 } };
  const clean = { accumulatedExposure: { domainsRead: new Set(), effectorsUsed: new Set() } };
  const exposed = { accumulatedExposure: { domainsRead: new Set(['secret']), effectorsUsed: new Set() } };
  assert.notEqual(verdictCacheKey(base, clean), verdictCacheKey(base, exposed),
    'same intent after reading a sensitive domain is a different cache line');
});

test('cache: LRU eviction respects maxEntries', () => {
  const c = new VerdictCache({ maxEntries: 2, allowTtlMs: 10_000 });
  const v = { name: 'PROCEED', permits: true };
  c.put('a', v, 1); c.put('b', v, 1); c.put('c', v, 1); // 'a' evicted
  assert.equal(c.get('a', 1), null);
  assert.ok(c.get('b', 1) && c.get('c', 1));
});

// ── cache integration: repeated conservative intents hit, and stay sound ────

async function boot(opts = {}) {
  const adj = new IsolatedAdjudicator({ taxonomy: TAXONOMY, timeoutMs: 4000, ...opts });
  await adj.start();
  const { ctx } = await adj.admit({ origin: 's5-test' });
  return { adj, ctx };
}

test('S-5 cache: a repeated identical conservative gate is served from cache', async () => {
  const { adj, ctx } = await boot();
  const intent = { action: 'tool:calculator', requiresToken: true, kind: 'action', args: { x: 2 } };
  const first = await adj.gate(intent, ctx);
  assert.equal(first.verdict.permits, true);
  assert.ok(!first.cached, 'first is a cold miss');
  const second = await adj.gate(intent, ctx);
  assert.equal(second.verdict.permits, true);
  assert.equal(second.cached, true, 'second identical intent is a cache hit');
  assert.ok(second.token && second.token.sig, 'but a fresh token is still minted (tokens are never cached)');
  const att = await adj.attest();
  assert.ok(att.cache.hits >= 1, 'attestation reports the hit');
  await adj.stop();
});

test('S-5 cache SOUNDNESS: a constraint tightening bumps the epoch and kills the cached ALLOW', async () => {
  const { adj, ctx } = await boot();
  const plain = { action: 'tool:calculator', requiresToken: true, kind: 'action', args: { x: 2 } };
  await adj.gate(plain, ctx);
  const cachedHit = await adj.gate(plain, ctx);
  assert.equal(cachedHit.cached, true, 'warm');

  // an intent that returns CONSTRAIN tightens the policy → epoch bump → cached ALLOW invalidated
  const epochBefore = (await adj.attest()).policyEpoch;
  await adj.gate({ action: 'tool:calculator', kind: 'action', args: { x: 2 }, addConstraints: { weighable: ['rate-limited'] }, requiresToken: true }, ctx);
  const epochAfter = (await adj.attest()).policyEpoch;
  assert.ok(epochAfter > epochBefore, 'tightening bumped the epoch');

  const afterBump = await adj.gate(plain, ctx);
  assert.ok(!afterBump.cached, 'the previously-cached ALLOW is no longer served (recomputed)');
  await adj.stop();
});

// ── leases: the explicit throughput horn, still sound ───────────────────────

test('S-5 lease: a leaseable class grants a budgeted token redeemed cheaply N times', async () => {
  const { adj, ctx } = await boot();
  const { verdict, token, lease } = await adj.gate(
    { action: 'tool:readonly', requiresToken: true, kind: 'action', lease: { uses: 3, ttlMs: 60_000 } }, ctx);
  assert.equal(verdict.permits, true);
  assert.equal(lease.uses, 3);
  assert.ok(token && token.sig);

  // three cheap redemptions, then exhaustion — no pipeline re-run per use
  assert.deepEqual(await adj.useLease(token, 'tool:readonly'), { ok: true, remaining: 2, reason: undefined });
  assert.equal((await adj.useLease(token, 'tool:readonly')).remaining, 1);
  assert.equal((await adj.useLease(token, 'tool:readonly')).remaining, 0);
  const exhausted = await adj.useLease(token, 'tool:readonly');
  assert.equal(exhausted.ok, false);
  assert.match(exhausted.reason, /exhausted/);
  await adj.stop();
});

test('S-5 lease SOUND: an irreversible class is refused a lease (fail-closed)', async () => {
  const { adj, ctx } = await boot();
  const { verdict, token } = await adj.gate(
    { action: 'db:drop', requiresToken: true, kind: 'action', lease: { uses: 100 } }, ctx);
  // db:drop is 'irreversible' ⇒ semantic tier ⇒ (no evaluator) fail-closed BEFORE any lease grant
  assert.equal(verdict.permits, false);
  assert.equal(token, null);
  await adj.stop();
});

test('S-5 lease SOUND: an unregistered class is refused a lease (no shortcut without a reversibility claim)', async () => {
  // a taxonomy where the action is registered safe but NOT reversible ⇒ not leaseable
  const tax = new HarmTaxonomy({ classes: [{ action: 'tool:maybe', tags: ['safe'] }] }).toJSON();
  const adj = new IsolatedAdjudicator({ taxonomy: tax, timeoutMs: 4000 });
  await adj.start();
  const { ctx } = await adj.admit({ origin: 'lease-refuse' });
  const { verdict } = await adj.gate({ action: 'tool:maybe', requiresToken: true, kind: 'action', lease: { uses: 5 } }, ctx);
  assert.equal(verdict.permits, false, 'safe-but-not-reversible is refused a lease');
  assert.match(verdict.reason, /leaseable|fail-closed/);
  await adj.stop();
});

test('GOLDEN INVARIANT extends to leases: a dead adjudicator cannot redeem a lease', async () => {
  const { adj, ctx } = await boot();
  const { token } = await adj.gate(
    { action: 'tool:readonly', requiresToken: true, kind: 'action', lease: { uses: 5, ttlMs: 60_000 } }, ctx);
  await adj.stop(); // kill the adjudicator
  const used = await adj.useLease(token, 'tool:readonly');
  assert.equal(used.ok, false, 'no redemption without the worker — leases die with the adjudicator');
});
