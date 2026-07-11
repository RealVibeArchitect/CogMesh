// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/constitution/DecisionContext.js — the session-carried governance object from
// CONSTITUTION-SPEC.md §2. It flows downward (constraints) and accumulates (monotonic tightening).
//
// The context is IMMUTABLE at the constraint level: withConstraints() / withExposure() return a NEW
// context. Because ConstraintSet has no loosen, and the context only ever replaces its set via
// tighten/meet, a session's constraints can only accumulate — the monotonic-tightening invariant is
// structural end to end.

import { ConstraintSet } from './ConstraintSet.js';

let _seq = 0;

export class DecisionContext {
  constructor({
    sessionId = `sess_${++_seq}`,
    constraints = ConstraintSet.empty(),
    partitionTags = {},
    accumulatedExposure = { domainsRead: new Set(), effectorsUsed: new Set() },
    capabilityTokens = [],
    trajectoryRef = null,
    provenance = {},
  } = {}) {
    this.sessionId = sessionId;
    this.constraints = constraints;
    this.partitionTags = partitionTags;              // { regionName: 'FROZEN' | 'FLUID' }
    this.accumulatedExposure = accumulatedExposure;
    this.capabilityTokens = capabilityTokens;
    this.trajectoryRef = trajectoryRef;
    this.provenance = { admittedAt: Date.now(), priorVerdicts: [], ...provenance };
    Object.freeze(this);
  }

  /** Return a new context with additional constraints (tighten-only). */
  withConstraints(delta) {
    return this._clone({ constraints: this.constraints.tighten(delta) });
  }

  /** Return a new context recording additional accumulated exposure (used by S4). */
  withExposure({ domain = null, effector = null, domains = [], effectors = [] } = {}) {
    const domainsRead = new Set(this.accumulatedExposure.domainsRead);
    const effectorsUsed = new Set(this.accumulatedExposure.effectorsUsed);
    if (domain) domainsRead.add(domain);
    if (effector) effectorsUsed.add(effector);
    for (const d of domains) domainsRead.add(d);
    for (const e of effectors) effectorsUsed.add(e);
    return this._clone({ accumulatedExposure: { domainsRead, effectorsUsed } });
  }

  /** Return a new context with a token attached (from the runtime after minting). */
  withToken(token) {
    return this._clone({ capabilityTokens: [...this.capabilityTokens, token] });
  }

  /** Return a new context recording a verdict in provenance (audit trail within the session). */
  withVerdict(verdict) {
    const prov = { ...this.provenance, priorVerdicts: [...this.provenance.priorVerdicts, verdict] };
    return this._clone({ provenance: prov });
  }

  /** Partition helper: is this region declared FLUID (self-modifying → must be anchored)? */
  isFluid(region) {
    return this.partitionTags[region] === 'FLUID';
  }

  _clone(overrides) {
    return new DecisionContext({
      sessionId: this.sessionId,
      constraints: this.constraints,
      partitionTags: this.partitionTags,
      accumulatedExposure: this.accumulatedExposure,
      capabilityTokens: this.capabilityTokens,
      trajectoryRef: this.trajectoryRef,
      provenance: this.provenance,
      ...overrides,
    });
  }
}
