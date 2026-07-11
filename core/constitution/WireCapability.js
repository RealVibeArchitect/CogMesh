// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/constitution/WireCapability.js — capability tokens that survive process isolation.
//
// WHY THIS EXISTS (the S-2 isolation blocker):
//   The in-process Token (Capability.js) is made unforgeable by a module-local Symbol brand
//   stored in a NON-ENUMERABLE, non-writable slot. That is airtight in one process — but it
//   cannot cross a worker boundary: structuredClone (the postMessage serializer) drops BOTH
//   Symbols AND non-enumerable properties. So the instant the adjudicator moves into its own
//   worker, every branded token arrives on the main thread stripped of its brand and is
//   (correctly) rejected. Isolation and the Symbol brand are mutually exclusive.
//
// THE FIX — authenticity by construction, not by object identity:
//   A wire token is PLAIN DATA — { id, action, argBounds, validity, expiresAt, nonce } — with
//   an HMAC-SHA-256 signature over its canonical serialization, keyed by a secret that lives
//   ONLY inside the adjudicator worker. The main thread can carry a token, log it, and hand it
//   to an effector, but it can NEVER mint or alter one: without the key, any edit invalidates
//   the MAC, and forging a fresh signature is a preimage/MAC-forgery problem, not a spread-copy.
//
//   Verification and one-shot consumption also happen ONLY inside the worker (it owns the
//   secret and the spent-set). This is the golden invariant that makes isolation a SAFETY gain
//   rather than a mere refactor:
//
//       mint + verify + consume all require the worker's secret
//         ⇒ killing / crashing the adjudicator does not grant freedom, it grants PARALYSIS
//         ⇒ no valid token can be produced or redeemed, so every governed effect stops.
//
//   That is the property S-2 asked for: the most safety-critical component, when attacked,
//   fails CLOSED by construction.
//
// Crypto note: uses node:crypto HMAC (timing-safe comparison). No third-party dependency; the
// governed core stays dependency-free. Browser deployments that need this can supply a WebCrypto
// adapter behind the same {sign, verify} surface — kept small on purpose.

import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

/**
 * Canonical, stable serialization of the signed fields. Key order is FIXED here (not derived
 * from Object.keys) so the string a signer produces and the string a verifier reconstructs are
 * byte-identical regardless of insertion order or a hostile re-ordering on the wire.
 */
function canonical(claims) {
  // argBounds is the only nested field; stringify it with sorted keys for stability.
  const ab = claims.argBounds ? stableStringify(claims.argBounds) : 'null';
  return [
    claims.id,
    claims.action,
    ab,
    claims.validity,
    claims.expiresAt == null ? 'null' : String(claims.expiresAt),
    claims.parent == null ? 'null' : String(claims.parent),
    claims.nonce,
  ].join('\x1f'); // unit separator — cannot appear in the field values we produce
}

function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const keys = Object.keys(v).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
}

/**
 * The authority to create and redeem wire tokens. Holds the secret key. In the isolation
 * architecture EXACTLY ONE of these exists, INSIDE the adjudicator worker. The main thread
 * never constructs a WireCapabilityMint — it only receives already-signed token data.
 */
export class WireCapabilityMint {
  /**
   * @param {{ secret?:Buffer|string }} [opts]
   *   secret: the HMAC key. Omit to generate a fresh 32-byte random key (the normal case —
   *           the key then never leaves this object). Supply one only to pin it in a test.
   */
  constructor({ secret } = {}) {
    this._secret = secret != null
      ? (Buffer.isBuffer(secret) ? secret : Buffer.from(secret))
      : randomBytes(32);
    this._seq = 0;
    this._spent = new Set(); // ids of consumed one-shot tokens (lives with the mint = in-worker)
  }

  /**
   * Mint a signed wire token authorizing exactly one action. Mirrors CapabilityMint.mint()'s
   * spec, but returns PLAIN DATA carrying a signature (safe to postMessage).
   * @param {{ action:string, argBounds?:object, validity?:'one-shot'|'window', expiresAt?:number, parent?:string }} spec
   * @returns {{ id, action, argBounds, validity, expiresAt, parent, nonce, sig }}
   */
  mint(spec) {
    if (!spec || typeof spec.action !== 'string') {
      throw new Error('[WireCapabilityMint] a token needs an action');
    }
    const claims = {
      id: `cap_${++this._seq}`,
      action: spec.action,
      argBounds: spec.argBounds || null,
      validity: spec.validity || 'one-shot',
      expiresAt: spec.expiresAt || null,
      parent: spec.parent || null,
      nonce: randomBytes(12).toString('base64'),
    };
    return { ...claims, sig: this._sign(claims) };
  }

  /**
   * Attenuate: derive a STRICTLY NARROWER child (same action, bounds only added). Authority can
   * only shrink down a delegation chain — never grow (mirrors CapabilityMint.attenuate + TP-2).
   */
  attenuate(parent, narrowing = {}) {
    if (!this._authentic(parent)) throw new Error('[WireCapabilityMint] can only attenuate a genuine token');
    return this.mint({
      action: parent.action,
      argBounds: { ...(parent.argBounds || {}), ...(narrowing.argBounds || {}) }, // child keys → narrower
      validity: narrowing.validity || parent.validity,
      expiresAt: narrowing.expiresAt || parent.expiresAt,
      parent: parent.id,
    });
  }

  /**
   * Verify a wire token: signature authentic (this key), not expired, not already spent, and it
   * authorizes action+args. The effector-boundary check — but it runs INSIDE the worker, because
   * only the worker can recompute the MAC. A token edited anywhere on the wire fails here.
   * @returns {{ ok:boolean, reason:string }}
   */
  verify(token, action, args = {}) {
    if (!this._authentic(token)) return { ok: false, reason: 'signature invalid or malformed (forged/edited)' };
    if (this._spent.has(token.id)) return { ok: false, reason: 'one-shot token already consumed' };
    if (token.validity === 'window' && token.expiresAt != null && Date.now() > token.expiresAt) {
      return { ok: false, reason: 'token window expired' };
    }
    if (token.action !== action) return { ok: false, reason: 'token action mismatch' };
    if (token.argBounds) {
      for (const [k, bound] of Object.entries(token.argBounds)) {
        if (!(k in args)) return { ok: false, reason: `arg bound '${k}' not satisfied` };
        if (typeof bound !== 'object' && args[k] !== bound) return { ok: false, reason: `arg bound '${k}' mismatch` };
      }
    }
    return { ok: true, reason: 'authentic' };
  }

  /** Mark a one-shot token spent. Idempotent. In-worker (the spent-set lives with the secret). */
  consume(token) {
    if (this._authentic(token) && token.validity === 'one-shot') this._spent.add(token.id);
    return token;
  }

  _sign(claims) {
    return createHmac('sha256', this._secret).update(canonical(claims)).digest('base64');
  }

  /** Constant-time signature check over the canonical form. */
  _authentic(token) {
    if (!token || typeof token !== 'object' || typeof token.sig !== 'string') return false;
    let expected;
    try { expected = this._sign(token); } catch { return false; }
    const a = Buffer.from(token.sig, 'base64');
    const b = Buffer.from(expected, 'base64');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }
}

// A stateless authenticity check is intentionally NOT exported for the main thread: authenticity
// is only meaningful where the secret lives (the worker). Everything crosses via the adjudicator.
export { canonical as _canonicalForTests };
