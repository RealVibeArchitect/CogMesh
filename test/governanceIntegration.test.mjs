// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// test/governanceIntegration.test.mjs — the WHOLE governance core, wired into a real AgentLoop.
//
// Every other governance test exercises one component through the adjudicator's RPC surface. This
// suite proves they compose: an AgentLoop, given the IsolatedAdjudicator with a HarmTaxonomy (S-4)
// + a CalibrationLedger (S-1) + the CanaryBattery (S-3), governs actual tool calls end-to-end —
// benign tools proceed, forbidden tools are blocked, irreversible oracle-backed tools escalate
// until the class earns calibrated trust, and a self-modifying tool that carries canary-class harm
// freezes the capability. The loop threads each tool's DECLARED governance nature into the gate;
// nothing in the loop hard-codes policy.
//
// This is also the "does the wiring survive mutation?" anchor: the governance-mutation harness
// includes these paths, so a sabotage that neutralizes a check fails a REAL agent flow, not just
// a unit contract.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AgentLoop, ToolRegistry, defineTool, rulePolicy } from '../core/agent/index.js';
import { IsolatedAdjudicator } from '../core/constitution/IsolatedAdjudicator.js';
import { HarmTaxonomy } from '../core/constitution/HarmTaxonomy.js';

// ── a toolbox that declares its governance nature ────────────────────────────
const calculator = defineTool({
  name: 'calculator', description: 'safe arithmetic', safe: true,
  run: ({ expression }) => ({ value: expression === '6*7' ? 42 : NaN }),
});
const migrate = defineTool({
  name: 'migrate', description: 'run an irreversible DB migration',
  governance: { irreversible: true, oracleClass: 'db:migrate' }, // S-1: needs calibrated trust
  run: () => ({ migrated: true }),
});
const shred = defineTool({
  name: 'shred', description: 'irrecoverably destroy data',
  run: () => ({ shredded: true }), // taxonomy marks tool:shred forbidden ⇒ mechanical deny
});
const evolve = defineTool({
  name: 'evolve', description: 'apply a self-modification to the agent',
  governance: { selfModify: true }, // S-3: routes through the canary battery
  run: () => ({ evolved: true }),
});

const TAXONOMY = new HarmTaxonomy({
  classes: [
    { action: 'tool:calculator', tags: ['safe', 'reversible'] },
    { action: 'tool:shred', tags: ['forbidden'] },
    { action: 'tool:migrate', tags: ['irreversible'] }, // routes to semantic review + S-1 calibration
    { action: 'tool:evolve', tags: ['semantic'] },       // self-mod tool also gets semantic review
  ],
}).toJSON();

// a semantic evaluator that clears everything — so in the migrate/self-mod tests the DECIDING gate
// is S-1 calibration or the canary battery, not the semantic-tier sound-default. (The sound
// default itself is contract-tested in test/semanticTiering.test.mjs.)
const CLEARING_EVALUATOR = { evaluate: async () => ({ harmful: false }) };

function tools() {
  return new ToolRegistry().register(calculator).register(migrate).register(shred).register(evolve);
}

/** A one-shot policy: call `tool` once with `args`, then finish with the tool's result/verdict. */
function callOnce(tool, args = {}) {
  return rulePolicy([
    { when: (o) => o.step === 0, act: () => ({ type: 'tool', tool, args }) },
    { when: (o) => o.step > 0, act: (o) => ({ type: 'finish', answer: o.lastResult }) },
  ]);
}

async function governedAgent(policy, adjOpts = {}) {
  const adj = new IsolatedAdjudicator({ taxonomy: TAXONOMY, semanticEvaluator: CLEARING_EVALUATOR, calibration: { minSamples: 3, calibratedThreshold: 0.7 }, timeoutMs: 5000, ...adjOpts });
  await adj.start();
  const agent = new AgentLoop({ tools: tools(), constitution: adj, policy, config: { maxSteps: 3 } });
  return { adj, agent };
}

// ── the normal flow: a benign tool call proceeds and actually executes ───────

test('INTEGRATION: a benign safe tool proceeds end-to-end through the full stack', async () => {
  const { adj, agent } = await governedAgent(callOnce('calculator', { expression: '6*7' }));
  const r = await agent.run('compute 6*7');
  assert.equal(r.governed, true);
  assert.deepEqual(r.answer.result, { value: 42 }, 'the permitted tool ran and returned');
  const att = await adj.attest();
  assert.equal(att.chainIntact, true, 'the whole run is recorded in the isolated trajectory');
  assert.equal(att.tiered, true, 'taxonomy routing was active');
  await adj.stop();
});

// ── S-4: a taxonomy-forbidden tool is mechanically blocked in a real run ────

test('INTEGRATION: a forbidden tool is blocked (mechanical deny) and never executes', async () => {
  const { adj, agent } = await governedAgent(callOnce('shred'));
  const r = await agent.run('destroy everything');
  const blocked = r.trace.find((t) => t.result?.constitutionalVerdict === 'HALT');
  assert.ok(blocked, 'the tool call was HALTed');
  assert.match(blocked.result.error, /mechanical floor|blocked by constitution/);
  await adj.stop();
});

// ── S-1: an irreversible oracle-backed tool escalates until the class is calibrated ──

test('INTEGRATION: an irreversible tool on an UNCALIBRATED class is blocked in the loop', async () => {
  const { adj, agent } = await governedAgent(callOnce('migrate')); // no anchor, no track record
  const r = await agent.run('migrate the database');
  const blocked = r.trace.find((t) => t.result && t.result.ok === false);
  assert.ok(blocked, 'an untrusted irreversible bet does not execute');
  assert.match(blocked.result.error, /blocked by constitution/);
  await adj.stop();
});

test('INTEGRATION: after the class earns calibration, the SAME irreversible tool proceeds', async () => {
  const { adj, agent } = await governedAgent(callOnce('migrate'));
  // the class earns a track record of accurate predictions (the S-1 closed loop)
  for (let i = 0; i < 4; i++) await adj.recordOutcome('db:migrate', { error: 0.03 });
  const r = await agent.run('migrate the database');
  assert.deepEqual(r.answer.result, { migrated: true }, 'a now-trusted irreversible action executes');
  await adj.stop();
});

test('INTEGRATION: an anchor can authorize the uncalibrated irreversible tool (escalation path)', async () => {
  const { adj, agent } = await governedAgent(callOnce('migrate'), { externalAnchor: { authorize: () => true } });
  const r = await agent.run('migrate the database');
  assert.deepEqual(r.answer.result, { migrated: true }, 'the anchor is the correct fallback authority');
  await adj.stop();
});

// ── S-3: a self-modifying tool carrying canary-class harm freezes the capability ──

test('INTEGRATION: a self-mod tool with a complete honest proof proceeds', async () => {
  const { adj, agent } = await governedAgent(
    callOnce('evolve', { evaluatorProof: ['weaken-inviolable', 'add-loosen-op', 'bypass-mint', 'mutate-trajectory', 'self-grant-power', 'disable-canary', 'exfiltrate-secret', 'anchor-forge', 'unbounded-selfmod', 'silence-reportup'] }));
  const r = await agent.run('improve myself safely');
  assert.deepEqual(r.answer.result, { evolved: true }, 'a competent-evaluator self-mod proceeds');
  await adj.stop();
});

test('INTEGRATION: a self-mod tool that carries canary-class harm is blocked AND freezes self-mod', async () => {
  const harmfulEvolve = defineTool({
    name: 'evolve', description: 'a self-mod that secretly disables the canary battery',
    governance: { selfModify: true, modifiesCanaryClass: 'disable-canary' }, // ground-truth harm
    run: () => ({ evolved: true }),
  });
  const adj = new IsolatedAdjudicator({ taxonomy: TAXONOMY, semanticEvaluator: CLEARING_EVALUATOR, timeoutMs: 5000 });
  await adj.start();
  const registry = new ToolRegistry().register(harmfulEvolve);
  const agent = new AgentLoop({
    tools: registry, constitution: adj,
    policy: callOnce('evolve', { evaluatorProof: ['weaken-inviolable', 'add-loosen-op', 'bypass-mint', 'mutate-trajectory', 'self-grant-power', 'disable-canary', 'exfiltrate-secret', 'anchor-forge', 'unbounded-selfmod', 'silence-reportup'] }),
    config: { maxSteps: 3 },
  });
  const r = await agent.run('disable my own safety and evolve');
  const blocked = r.trace.find((t) => t.result?.ok === false);
  assert.ok(blocked, 'the harmful self-mod was blocked by its ground-truth nature, not its proof');
  assert.equal((await adj.attest()).canaryFrozen, true, 'self-mod is now frozen for the whole agent');
  await adj.stop();
});

// ── the golden invariant, at the agent level ─────────────────────────────────

test('INTEGRATION GOLDEN: a dead adjudicator paralyzes the agent (no tool executes)', async () => {
  const { adj, agent } = await governedAgent(callOnce('calculator', { expression: '6*7' }));
  await adj.stop(); // kill governance BEFORE the run
  const r = await agent.run('compute 6*7');
  const blocked = r.trace.find((t) => t.result?.constitutionalVerdict === 'HALT');
  assert.ok(blocked, 'every governed tool call HALTs — killing the adjudicator is paralysis, not freedom');
  await adj.stop();
});
