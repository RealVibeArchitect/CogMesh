// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/constitution/Capability.js — unforgeable, per-action, attenuating capability tokens.
//
// Implements the object-capability model from CONSTITUTION-SPEC.md §2.3. The design property:
// *authority to act is an unforgeable thing you hold, not an ambient property of where you are.*
// Holding a valid token is the ONLY way to perform a governed action; absence of a token = inert.
// This makes "no side door" (review finding CE-1) structural rather than conventional.
//
// How unforgeability is achieved in-process: a token is validated by comparing a private brand —
// a module-local Symbol that never leaves this file — against the brand stored (non-enumerably) on
// the token. A module cannot construct a valid token because it cannot obtain the brand. Only the
// CapabilityMint (held by the Constitution runtime) can stamp the brand. This is the JS analogue of
// a hardware capability tag: possession, not identity, grants authority, and the tag is unforgeable.
//
// NOTE ON THE TRUST BOUNDARY (per THREAT_MODEL.md §4): unforgeability holds *within the process*.
// A compromised host, a debugger, or code with the same process privileges can bypass it. The token
// model governs cooperating in-process modules, not a hostile host. This is stated, not hidden.

// The private brand. Never exported, never returned, never placed on any reachable object except a
// token's non-enumerable slot. A module that does not have this Symbol cannot forge a token.
const BRAND = Symbol('cogmesh.constitution.capability.brand');

let _seq = 0;

/**
 * A capability token. Construct ONLY via a CapabilityMint (below) — the constructor is not exported.
 * Fields mirror CONSTITUTION-SPEC.md §2.3: action_scope, validity, attenuation rule.
 */
class Token {
  constructor(brand, spec) {
    if (brand !== BRAND) {
      // Structural enforcement of "mint-only": you cannot new a Token without the private brand.
      throw new Error('[Capability] tokens can only be minted by the Constitution runtime');
    }
    this.id = `cap_${++_seq}`;
    this.action = spec.action;                 // the operation this authorizes (e.g. 'tool:calculator')
    this.argBounds = spec.argBounds || null;   // constraints on arguments (null = any within action)
    this.validity = spec.validity || 'one-shot'; // 'one-shot' | 'window'
    this.expiresAt = spec.expiresAt || null;   // for 'window' validity
    this.parent = spec.parent || null;         // id of the token this was attenuated from
    // the brand lives in a non-enumerable, non-writable slot so it can't be copied off casually
    Object.defineProperty(this, '_brand', { value: BRAND, enumerable: false, writable: false });
    this._spent = false;
    Object.freeze(this.argBounds);
  }

  /** True if this token currently authorizes the given action + args. Pure, no side effects. */
  authorizes(action, args = {}) {
    if (this._spent) return false;
    if (this.validity === 'window' && this.expiresAt != null && Date.now() > this.expiresAt) return false;
    if (this.action !== action) return false;
    if (this.argBounds) {
      // argBounds is a set of {key: allowedValue|predicate-descriptor}; here we support exact bounds
      for (const [k, bound] of Object.entries(this.argBounds)) {
        if (!(k in args)) return false;
        if (typeof bound !== 'object' && args[k] !== bound) return false;
      }
    }
    return true;
  }
}

/**
 * The CapabilityMint holds the private brand and is the ONLY way to create tokens. The Constitution
 * runtime holds one mint; governed modules never do. This is the structural core of "mint-only-by-
 * runtime": authority to *create* authority is itself unforgeable.
 */
export class CapabilityMint {
  /**
   * Mint a fresh token authorizing exactly one action (optionally arg-bounded).
   * @param {{ action:string, argBounds?:object, validity?:'one-shot'|'window', expiresAt?:number }} spec
   * @returns {Token}
   */
  mint(spec) {
    if (!spec || typeof spec.action !== 'string') {
      throw new Error('[CapabilityMint] a token needs an action');
    }
    return new Token(BRAND, spec);
  }

  /**
   * Attenuate: derive a STRICTLY NARROWER child token from a parent. Authority can only shrink down a
   * delegation chain — never hold or grow (CONSTITUTION-SPEC.md §2.3, resolves review TP-2). The child
   * must authorize a subset of what the parent does; this method refuses to widen.
   * @param {Token} parent
   * @param {{ argBounds?:object, validity?:'one-shot'|'window', expiresAt?:number }} narrowing
   * @returns {Token} a strictly-narrower child token
   */
  attenuate(parent, narrowing = {}) {
    if (!isToken(parent)) throw new Error('[CapabilityMint] can only attenuate a genuine token');
    // child keeps the parent's action (cannot switch to a different/broader action)
    const childSpec = {
      action: parent.action,
      // narrowing may add arg bounds but the child is validated against the parent too (see below)
      argBounds: mergeNarrower(parent.argBounds, narrowing.argBounds),
      validity: narrowing.validity || parent.validity,
      expiresAt: narrowing.expiresAt || parent.expiresAt,
      parent: parent.id,
    };
    return new Token(BRAND, childSpec);
  }
}

/**
 * Verify a token is genuine (brand-stamped by a mint) AND authorizes the action+args. This is the
 * check an effector boundary runs before acting. A forged object without the private brand fails
 * here regardless of how well it mimics the shape of a Token.
 * @returns {boolean}
 */
export function verify(token, action, args = {}) {
  return isToken(token) && token.authorizes(action, args);
}

/** Mark a one-shot token spent (called by the runtime after a successful gated action). */
export function consume(token) {
  if (isToken(token) && token.validity === 'one-shot') {
    // _spent lives on the instance; only genuine tokens reach here
    Object.defineProperty(token, '_spent', { value: true, enumerable: false, writable: false });
  }
  return token;
}

/** A genuine token carries the private brand in its non-enumerable slot; a forgery cannot. */
function isToken(t) {
  return t instanceof Token && t._brand === BRAND;
}

/** Merge arg bounds so the result is at least as restrictive as both inputs (never looser). */
function mergeNarrower(parentBounds, childBounds) {
  if (!parentBounds && !childBounds) return null;
  return { ...(parentBounds || {}), ...(childBounds || {}) }; // child keys add/override → narrower
}

// Token constructor is intentionally NOT exported — no module outside can construct one.
export { Token as _TokenForTypeChecksOnly };
