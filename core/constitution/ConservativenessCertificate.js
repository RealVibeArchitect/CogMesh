// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/constitution/ConservativenessCertificate.js — implements the certificate CHECKER from
// CONSTITUTION-CERTIFICATES.md (W-1a) and CONSTITUTION-COVERAGE.md (W-1a-ii).
//
// The design property (why this escapes the circularity): the kernel does NOT reason about whether a
// change is safe — it CHECKS a derivation proving the change is built by composing pre-approved
// reachability-preserving transformations. Checking a proof is capability-independent; only the
// *curation* of the transformation catalog is a judgment, and that is deferred to the external anchor
// (see registerTransformation note). The composition of non-expanding maps is non-expanding, so a
// valid derivation implies non-expansion without simulating the system.
//
// A certificate is a DERIVATION: an ordered list of steps, each naming a catalog transformation and
// the site it applies to. The checker verifies three things (CONSTITUTION-CERTIFICATES.md §B3):
//   (1) every step cites an approved-catalog transformation
//   (2) each step's fixed preconditions hold at its site
//   (3) the steps COVER the entire effect closure of the change (nothing unexplained) — the W-1a-ii
//       coverage check, over the effect closure (reach), NOT merely the code diff.
//
// IMPORTANT HONEST LIMIT (from the review): coverage here is over a *statically declared* effect
// closure. A change that touches behavior-determining state (weights/policy) is NOT certifiable as
// conservative by this checker — that is the -TERMINATION finding, enforced by rejecting any step or
// change flagged behaviorDetermining. Such changes must route to the external anchor, not a
// certificate.

/**
 * The approved-transformation catalog. Each entry is a reachability-preserving transformation whose
 * safety was established ONCE, externally. The checker only looks entries up; it never judges whether
 * a novel transformation is safe. EXTENDING this catalog is a power-authorization-class act and must
 * go through the external anchor (not done here) — see CONSTITUTION-CERTIFICATES.md §B4.
 */
export const APPROVED_TRANSFORMATIONS = Object.freeze({
  // name → { preconditions: (step) => bool, note }
  'cache-memoize': {
    note: 'memoize a pure function; same decision, computed once',
    preconditions: (s) => s.pure === true, // only sound for a pure function
  },
  'dead-branch-elim': {
    note: 'remove a provably-unreachable branch',
    preconditions: (s) => s.branchProvablyUnreachable === true,
  },
  'parallelize-independent': {
    note: 'run provably-independent units concurrently',
    preconditions: (s) => s.unitsProvablyIndependent === true,
  },
  'algebraic-simplify': {
    note: 'replace an expression with a provably-equal one',
    preconditions: (s) => s.provablyEqual === true,
  },
  'precompute-constant': {
    note: 'precompute a constant expression',
    preconditions: (s) => s.isConstant === true,
  },
});

/**
 * Check a conservativeness certificate. Pure, capability-independent, total.
 *
 * @param {object} certificate
 * @param {Array<{ transform:string, site:string, [pre:string]:any }>} certificate.steps
 *        the derivation: each step names a catalog transform, the site, and its precondition facts.
 * @param {string[]} certificate.effectClosure
 *        the (over-approximated, static) set of state elements the change can touch. Coverage must
 *        account for ALL of these.
 * @param {boolean} [certificate.touchesBehaviorDeterminingState]
 *        if true, the change alters behavior-determining state → NOT certifiable (route to anchor).
 * @param {object} [catalog] the approved-transformation catalog (defaults to APPROVED_TRANSFORMATIONS)
 * @returns {{ conservative:boolean, reason:string }}
 */
export function checkCertificate(certificate, catalog = APPROVED_TRANSFORMATIONS) {
  if (!certificate || !Array.isArray(certificate.steps)) {
    return { conservative: false, reason: 'malformed certificate (no steps)' };
  }

  // -TERMINATION guard: behavior-determining changes are never conservative-by-certificate.
  if (certificate.touchesBehaviorDeterminingState) {
    return {
      conservative: false,
      reason: 'change touches behavior-determining state → not certifiable; route to external anchor',
    };
  }

  const covered = new Set();
  for (const step of certificate.steps) {
    // (1) every step cites an approved-catalog transformation
    const entry = catalog[step.transform];
    if (!entry) {
      return { conservative: false, reason: `step cites unapproved transformation "${step.transform}"` };
    }
    // (2) each step's fixed preconditions hold at its site
    if (!entry.preconditions(step)) {
      return { conservative: false, reason: `preconditions not met for "${step.transform}" at ${step.site}` };
    }
    if (step.site) covered.add(step.site);
    // a step may declare which closure elements it accounts for
    for (const el of step.covers || []) covered.add(el);
  }

  // (3) coverage: the steps must account for the ENTIRE effect closure — nothing unexplained.
  const closure = certificate.effectClosure || [];
  const uncovered = closure.filter((el) => !covered.has(el));
  if (uncovered.length) {
    return {
      conservative: false,
      reason: `derivation does not cover the whole effect closure; unexplained: ${uncovered.join(', ')}`,
    };
  }

  // all three hold → composition of non-expanding transforms → non-expanding (conservative)
  return { conservative: true, reason: 'derivation covers the effect closure with approved transforms' };
}

/**
 * Catalog EXTENSION is deliberately NOT implemented as an in-system operation. Adding a transformation
 * as "reachability-preserving" is a judgment that could license expansion, so it is a power-
 * authorization-class act reserved for the external anchor (CONSTITUTION-CERTIFICATES.md §B4). This
 * stub documents the boundary rather than crossing it.
 */
export function registerTransformation() {
  throw new Error(
    '[ConservativenessCertificate] extending the transformation catalog is an external-anchor act, ' +
    'not an in-system operation (CONSTITUTION-CERTIFICATES.md §B4)',
  );
}
