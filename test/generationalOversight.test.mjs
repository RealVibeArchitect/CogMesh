// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// test/generationalOversight.test.mjs — the G-1..G-6 oversight invariants across lineages.
//
// Honest scope: these test the CHECKABLE structural claim (no accepted generation removed an
// oversight mechanism, lowered the floor, cut accountability, or regressed competence). They do
// NOT test the unprovable semantic claim (§13). A rejected proposal = a located, concrete
// oversight failure the mechanism refused to accept.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  GenerationLineage, checkGenerationStep, generationHash, OVERSIGHT_MECHANISMS,
} from '../core/constitution/GenerationalOversight.js';

const GENESIS = {
  floor: ['no-self-exfiltration', 'no-unbounded-power'],
  mechanisms: [...OVERSIGHT_MECHANISMS],
  canariesCaught: ['weaken-inviolable', 'bypass-mint', 'disable-canary'],
  capabilities: ['tool:calculator', 'tool:search'],
};

/** Build a valid child of `parent` (same floor/mechanisms/canaries), then apply an override. */
function childOf(lineage, override = {}) {
  const p = lineage.head;
  return {
    floor: [...p.floor],
    mechanisms: [...p.mechanisms],
    canariesCaught: [...p.canariesCaught],
    capabilities: [...p.capabilities],
    ...override,
  };
}

test('lineage: a faithful generation (retains everything) is accepted', () => {
  const lin = new GenerationLineage(GENESIS);
  const r = lin.propose(childOf(lin));
  assert.equal(r.accepted, true);
  assert.equal(lin.length, 2);
  assert.equal(lin.verify().ok, true);
});

test('lineage: adding a capability WITH anchor authorization is accepted', () => {
  const lin = new GenerationLineage(GENESIS);
  const r = lin.propose(childOf(lin, {
    capabilities: [...GENESIS.capabilities, 'tool:email'],
    anchorAuthorizedIncrease: true,
  }));
  assert.equal(r.accepted, true, 'a properly-authorized power increase is allowed');
});

test('G-1: lowering the safety floor is REJECTED', () => {
  const lin = new GenerationLineage(GENESIS);
  const r = lin.propose(childOf(lin, { floor: ['no-self-exfiltration'] })); // dropped one
  assert.equal(r.accepted, false);
  assert.ok(r.violations.some((x) => x.id === 'G-1'));
});

test('G-2: removing an oversight mechanism is REJECTED', () => {
  const lin = new GenerationLineage(GENESIS);
  const r = lin.propose(childOf(lin, {
    mechanisms: OVERSIGHT_MECHANISMS.filter((m) => m !== 'canaryBattery'), // dropped the canary gate
  }));
  assert.equal(r.accepted, false);
  assert.ok(r.violations.some((x) => x.id === 'G-2' && /canaryBattery/.test(x.detail)));
});

test('G-3: regressing canary competence is REJECTED', () => {
  const lin = new GenerationLineage(GENESIS);
  const r = lin.propose(childOf(lin, {
    canariesCaught: ['weaken-inviolable', 'bypass-mint'], // no longer catches disable-canary
  }));
  assert.equal(r.accepted, false);
  assert.ok(r.violations.some((x) => x.id === 'G-3' && /disable-canary/.test(x.detail)));
});

test('G-4: a capability increase WITHOUT anchor authorization is REJECTED', () => {
  const lin = new GenerationLineage(GENESIS);
  const r = lin.propose(childOf(lin, {
    capabilities: [...GENESIS.capabilities, 'tool:wire-transfer'], // no anchorAuthorizedIncrease
  }));
  assert.equal(r.accepted, false);
  assert.ok(r.violations.some((x) => x.id === 'G-4'));
});

test('G-5: a forged lineage parent is detected by whole-chain verify', () => {
  const lin = new GenerationLineage(GENESIS);
  lin.propose(childOf(lin));
  // tamper: rewrite an accepted generation's floor after the fact
  lin._chain[1].floor = ['nothing'];
  const v = lin.verify();
  assert.equal(v.ok, false);
  assert.equal(v.at, 1);
});

test('G-6: a child with no rollback path to its parent is REJECTED', () => {
  const lin = new GenerationLineage(GENESIS);
  const r = lin.propose(childOf(lin, { rollbackTo: 'somewhere-else' }));
  assert.equal(r.accepted, false);
  assert.ok(r.violations.some((x) => x.id === 'G-6'));
});

test('lineage: a long faithful chain verifies end to end', () => {
  const lin = new GenerationLineage(GENESIS);
  for (let i = 0; i < 20; i++) {
    const r = lin.propose(childOf(lin, {
      // each generation legitimately adds a capability WITH authorization
      capabilities: [...lin.head.capabilities, `tool:gen${i}`],
      anchorAuthorizedIncrease: true,
    }));
    assert.equal(r.accepted, true, `generation ${i + 1} accepted`);
  }
  assert.equal(lin.length, 21);
  const v = lin.verify();
  assert.equal(v.ok, true);
  assert.equal(v.generations, 21);
});

test('checkGenerationStep: pure function usable outside a lineage', () => {
  const parent = { ...GENESIS, parent: null };
  parent.hash = generationHash(parent);
  const child = {
    ...GENESIS,
    parent: parent.hash,
    rollbackTo: parent.hash,
  };
  assert.equal(checkGenerationStep(parent, child).ok, true);
});
