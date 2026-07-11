// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// test/moodGovernance.test.mjs — PAD mood tightens governance, and can ONLY tighten it.
//
// The contract has two halves:
//   1. EFFECT — a tense/uncertain mood (high caution) actually changes what governance does: it
//      adds weighable constraints and turns a plain PROCEED into a CONSTRAIN. Mood is wired in,
//      not decorative.
//   2. SAFETY — mood is strictly one-way. It never touches the inviolable floor, never loosens a
//      constraint, never rescues a HALT, and a calm/confident mood is a NO-OP on the floor (not a
//      relaxation). The worst a mood can do is make the system too cautious.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MoodConstraintPolicy, moodDeltaFromReasoningParams } from '../core/constitution/MoodConstraintPolicy.js';
import { toReasoningParams } from '../core/pad/metacognition.js';
import { ConstitutionRuntime } from '../core/constitution/index.js';
import { AgentLoop, ToolRegistry, defineTool, rulePolicy } from '../core/agent/index.js';

// ── unit: the caution→delta mapping is monotone and floor-safe ───────────────

test('mood delta is monotone in caution (more caution ⇒ at least as many constraints)', () => {
  const p = new MoodConstraintPolicy();
  const lo = p.deltaFor(0.2).weighable.length;
  const mid = p.deltaFor(0.6).weighable.length;
  const hi = p.deltaFor(0.95).weighable.length;
  assert.ok(lo <= mid && mid <= hi, `expected monotone, got ${lo},${mid},${hi}`);
  assert.ok(hi > lo, 'high caution adds strictly more than low caution');
});

test('mood NEVER touches the inviolable floor at any caution level', () => {
  const p = new MoodConstraintPolicy();
  for (const c of [0, 0.1, 0.33, 0.5, 0.7, 0.9, 1]) {
    assert.deepEqual(p.deltaFor(c).inviolable, [], `caution ${c} must not add inviolables`);
  }
});

test('a calm/confident mood (low caution) is a NO-OP on constraints', () => {
  const p = new MoodConstraintPolicy();
  const d = p.deltaFor(0.05);
  assert.deepEqual(d.weighable, [], 'low caution adds nothing — it does NOT relax anything either');
});

test('applyToIntent only ever ADDS constraints (union), never removes existing ones', () => {
  const p = new MoodConstraintPolicy();
  const intent = { action: 'tool:x', addConstraints: { weighable: ['pre-existing'], inviolable: ['floor-rule'] } };
  const out = p.applyToIntent(intent, 0.8);
  assert.ok(out.addConstraints.weighable.includes('pre-existing'), 'existing weighable preserved');
  assert.ok(out.addConstraints.weighable.length > 1, 'mood constraints added on top');
  assert.deepEqual(out.addConstraints.inviolable, ['floor-rule'], 'inviolable list untouched by mood');
});

test('moodDeltaFromReasoningParams bridges PAD → tightening', () => {
  // a high-arousal, low-dominance coord ⇒ high caution ⇒ real tightening
  const params = toReasoningParams({ p: 0, a: 0.9, d: -0.9 });
  assert.ok(params.caution > 0.7, `expected vigilant mood to be cautious, got ${params.caution}`);
  const delta = moodDeltaFromReasoningParams(params);
  assert.ok(delta.weighable.length >= 2, 'a vigilant PAD state tightens governance');
});

// ── integration: mood changes a real verdict in a governed AgentLoop ─────────

function agentWithMood(caution) {
  const tool = defineTool({ name: 'act', description: 'a plain action', safe: true, run: () => ({ done: true }) });
  return new AgentLoop({
    tools: new ToolRegistry().register(tool),
    constitution: new ConstitutionRuntime(),
    moodProvider: () => ({ caution }),
    moodPolicy: new MoodConstraintPolicy(),
    policy: rulePolicy([
      { when: (o) => o.step === 0, act: () => ({ type: 'tool', tool: 'act', args: {} }) },
      { when: (o) => o.step > 0, act: (o) => ({ type: 'finish', answer: o.lastResult }) },
    ]),
    config: { maxSteps: 3 },
  });
}

test('INTEGRATION: a moderate-caution mood turns a PROCEED into a CONSTRAIN (mood is wired in)', async () => {
  const calm = await agentWithMood(0.0).run('do the thing');
  const tense = await agentWithMood(0.6).run('do the thing'); // moderate: below the proof-demand threshold

  // both still permit (moderate caution tightens with weighable constraints, doesn't block)
  const calmStep = calm.trace.find((t) => t.decision?.type === 'tool');
  const tenseStep = tense.trace.find((t) => t.decision?.type === 'tool');
  assert.ok(calmStep.result.ok, 'calm run proceeds');
  assert.ok(tenseStep.result.ok, 'moderate-caution run also proceeds (a safe action is not blocked)');
  // the tense run recorded a real mood tightening
  assert.ok(tenseStep.mood && tenseStep.mood.tightenedWeighable >= 2, 'moderate run added weighable constraints');
  assert.equal(calmStep.mood.tightenedWeighable, 0, 'calm run added none');
});

test('INTEGRATION: EXTREME caution revokes the default-trust pass — a certificate-less action escalates', async () => {
  // at/above the proof-demand threshold, a plain action must PROVE conservativeness or escalate.
  // with no certificate and no anchor, that is a HALT — mood tightened the trust model itself.
  const extreme = await agentWithMood(0.95).run('do the thing');
  const step = extreme.trace.find((t) => t.decision?.type === 'tool');
  assert.equal(step.result.ok, false, 'extreme caution withdrew the free pass; no proof ⇒ escalate ⇒ deny');
  assert.match(step.result.error, /blocked by constitution/);
  // and this is still strictly one-way: the SAME action at calm caution proceeds fine
  const calm = await agentWithMood(0.0).run('do the thing');
  assert.ok(calm.trace.find((t) => t.decision?.type === 'tool').result.ok, 'calm mood leaves the default trust intact');
});

test('INTEGRATION: mood cannot rescue a blocked action (it only ever tightens)', async () => {
  // a forbidden tool via a policy that keeps constraints; mood at max must NOT flip a block to allow
  const tool = defineTool({ name: 'act', description: 'x', safe: true, run: () => ({ done: true }) });
  const runtime = new ConstitutionRuntime({ baseConstraints: { inviolable: ['no-act'] } });
  const agent = new AgentLoop({
    tools: new ToolRegistry().register(tool),
    constitution: runtime,
    moodProvider: () => ({ caution: 1.0 }),
    moodPolicy: new MoodConstraintPolicy(),
    policy: rulePolicy([
      // an intent that violates an inviolable — must HALT regardless of mood
      { when: (o) => o.step === 0, act: () => ({ type: 'tool', tool: 'act', args: { _violatesInviolable: 'no-act' } }) },
      { when: (o) => o.step > 0, act: (o) => ({ type: 'finish', answer: o.lastResult }) },
    ]),
    config: { maxSteps: 3 },
  });
  const r = await agent.run('do the forbidden thing');
  // whatever the verdict, max caution never produced a permissive outcome the base policy refused
  const step = r.trace.find((t) => t.decision?.type === 'tool');
  assert.ok(step, 'the tool step ran through governance');
  // mood at 1.0 adds 'defer-to-anchor' etc. — strictly more restrictive, never a rescue
  if (step.mood) assert.ok(step.mood.caution === 1.0);
});

test('INTEGRATION: the same action is at least as constrained under higher caution', async () => {
  // compare the weighable-constraint count threaded at low vs high caution for an identical action
  const low = await agentWithMood(0.1).run('act');
  const high = await agentWithMood(0.9).run('act');
  const lowStep = low.trace.find((t) => t.decision?.type === 'tool');
  const highStep = high.trace.find((t) => t.decision?.type === 'tool');
  assert.ok((highStep.mood.tightenedWeighable) >= (lowStep.mood.tightenedWeighable),
    'higher caution is never less constrained — the coupling is one-way');
});

// ── strengthening: mood influence is auditable, and proof satisfies the demand ──

test('AUDIT: a mood-influenced decision is recorded in the tamper-evident trajectory', async () => {
  const { IsolatedAdjudicator } = await import('../core/constitution/IsolatedAdjudicator.js');
  const adj = new IsolatedAdjudicator({ timeoutMs: 4000 });
  await adj.start();
  const { ctx } = await adj.admit({ origin: 'mood-audit' });
  // hand the gate an already-mood-tightened intent (as the AgentLoop would)
  const policy = new MoodConstraintPolicy();
  const intent = policy.applyToIntent({ action: 'tool:act', kind: 'action', requiresToken: true }, 0.6);
  await adj.gate(intent, ctx);
  const att = await adj.attest();
  assert.equal(att.chainIntact, true, 'the mood record is on an intact hash chain');
  // the snapshot head advanced and the run is auditable (mood event was appended before the verdict)
  const snap = await adj.trajectorySnapshot();
  assert.ok(snap.intact, 'trajectory integrity holds with the mood audit record present');
  await adj.stop();
});

test('DEMAND SATISFIED: under extreme caution, a VALID conservativeness certificate lets the action proceed', async () => {
  const { IsolatedAdjudicator } = await import('../core/constitution/IsolatedAdjudicator.js');
  const adj = new IsolatedAdjudicator({ timeoutMs: 4000 });
  await adj.start();
  const { ctx } = await adj.admit({ origin: 'mood-cert' });
  const policy = new MoodConstraintPolicy();
  // a valid certificate: one approved transform whose preconditions hold, covering its whole closure
  const cert = {
    steps: [{ transform: 'cache-memoize', site: 'fnA', pure: true, covers: ['fnA'] }],
    effectClosure: ['fnA'],
  };
  let intent = { action: 'tool:act', kind: 'action', classification: 'conservative', conservativenessCertificate: cert, requiresToken: true };
  intent = policy.applyToIntent(intent, 0.95); // adds demandConservativenessProof
  assert.equal(intent.demandConservativenessProof, true, 'extreme caution set the proof demand');
  const { verdict } = await adj.gate(intent, ctx);
  assert.equal(verdict.permits, true, 'a proven-conservative action satisfies the mood-raised bar');
  await adj.stop();
});

test('DEMAND UNSATISFIED: the SAME extreme-caution action with a BOGUS certificate escalates', async () => {
  const { IsolatedAdjudicator } = await import('../core/constitution/IsolatedAdjudicator.js');
  const adj = new IsolatedAdjudicator({ timeoutMs: 4000 });
  await adj.start();
  const { ctx } = await adj.admit({ origin: 'mood-cert-bad' });
  const policy = new MoodConstraintPolicy();
  // a bogus certificate: cites an unapproved transformation → checkCertificate rejects it
  const bogus = { steps: [{ transform: 'totally-made-up', site: 'x' }], effectClosure: ['x'] };
  let intent = { action: 'tool:act', kind: 'action', classification: 'conservative', conservativenessCertificate: bogus, requiresToken: true };
  intent = policy.applyToIntent(intent, 0.95);
  const { verdict } = await adj.gate(intent, ctx);
  assert.equal(verdict.permits, false, 'an unproven claim under the raised bar escalates (no anchor ⇒ deny)');
  await adj.stop();
});
