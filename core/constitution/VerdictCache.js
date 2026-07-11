// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/constitution/VerdictCache.js — a cache that is only allowed to make governance STRICTER (S-5).
//
// THE PROBLEM (review S-5, the latency/coverage dilemma):
//   "Governing every irreversible action through a central adjudicator is either a throughput
//   bottleneck or, if made asynchronous/cached, a soundness hole. The design picks neither
//   horn explicitly."
//
// THE EXPLICIT PICK (this cache is one half of it; leases are the other — see AdjudicatorWorker):
//   Caching IS allowed, but only under an asymmetry that makes staleness safe by construction:
//
//     A STALE CACHE ENTRY MAY ONLY DENY, NEVER ALLOW.
//
//   Concretely:
//     • ALLOW entries are valid only while (a) the policy EPOCH they were computed under is
//       still current, and (b) their short TTL hasn't passed. The worker bumps the epoch on any
//       event that could make an old ALLOW unsound — a CONSTRAIN verdict (tightening), a canary
//       freeze, an anchor resolution (power state changed). One bump and every cached ALLOW
//       dies at once.
//     • DENY entries survive epoch bumps (denying more than necessary is sound — it can only
//       cost liveness, never safety) and expire only on their own longer TTL.
//     • Self-modification and anchor-escalating intents are NEVER cached (each is a fresh,
//       fully-recorded decision by definition).
//     • The key includes the session's accumulated-exposure digest, because pipeline verdicts
//       depend on exposure state (S4 sequence rules): the same intent after reading a sensitive
//       domain is a DIFFERENT question, and gets a different cache line.
//
//   The residual cost is honest and bounded: within one epoch and one TTL window, a repeated
//   identical conservative intent skips the pipeline re-run. That is the entire shortcut.

export class VerdictCache {
  /**
   * @param {{ allowTtlMs?:number, denyTtlMs?:number, maxEntries?:number }} [opts]
   */
  constructor({ allowTtlMs = 30_000, denyTtlMs = 300_000, maxEntries = 4096 } = {}) {
    this.allowTtlMs = allowTtlMs;
    this.denyTtlMs = denyTtlMs;
    this.maxEntries = maxEntries;
    this._map = new Map(); // key → { verdict, permits, epoch, expiresAt }
    this._hits = 0;
    this._misses = 0;
  }

  /**
   * Look up a cached verdict. ALLOW hits require the CURRENT epoch; DENY hits do not
   * (a deny computed under any past policy is still a sound deny under a tighter one).
   */
  get(key, epoch, now = Date.now()) {
    const e = this._map.get(key);
    if (!e || now >= e.expiresAt) { this._misses++; if (e) this._map.delete(key); return null; }
    if (e.permits && e.epoch !== epoch) { this._misses++; this._map.delete(key); return null; }
    this._hits++;
    // refresh LRU position
    this._map.delete(key);
    this._map.set(key, e);
    return e.verdict;
  }

  /** Store a verdict computed under `epoch`. */
  put(key, verdict, epoch, now = Date.now()) {
    const permits = !!verdict.permits;
    const ttl = permits ? this.allowTtlMs : this.denyTtlMs;
    if (this._map.size >= this.maxEntries) {
      // evict the oldest entry (Map preserves insertion order)
      const oldest = this._map.keys().next().value;
      this._map.delete(oldest);
    }
    this._map.set(key, { verdict, permits, epoch, expiresAt: now + ttl });
  }

  stats() {
    return { entries: this._map.size, hits: this._hits, misses: this._misses };
  }

  clear() { this._map.clear(); }
}

/**
 * A stable digest for the cache key: intent fields that determine the pipeline verdict, plus
 * the session's exposure signature (verdicts are exposure-dependent — see header). Order-stable
 * so semantically identical intents collide.
 */
export function verdictCacheKey(intent, ctx) {
  const exposure = ctx && ctx.accumulatedExposure
    ? `${[...ctx.accumulatedExposure.domainsRead].sort().join(',')}|${[...ctx.accumulatedExposure.effectorsUsed].sort().join(',')}`
    : '';
  return stable({
    action: intent.action ?? null,
    kind: intent.kind ?? null,
    args: intent.args ?? null,
    argBounds: intent.argBounds ?? null,
    requiresToken: !!intent.requiresToken,
    exposureDelta: intent.exposureDelta ?? null,
    addConstraints: intent.addConstraints ?? null,
    reachExpands: !!intent.reachExpands,
    touchesBDS: !!intent.touchesBehaviorDeterminingState,
    exposure,
  });
}

function stable(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
}
