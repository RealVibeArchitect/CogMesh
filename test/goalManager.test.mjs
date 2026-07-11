// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// test/goalManager.test.mjs — tests for multi-goal prioritization & lifecycle.
//
//   node --test test/goalManager.test.mjs
//   npm run test:goals

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { GoalManager } from '../core/orchestrator/goalManager.js';

// ── prioritization ────────────────────────────────────────────────────────
test('goals: higher importance/urgency sorts first', () => {
  const gm = new GoalManager();
  gm.add('low chore', { importance: 0.2, urgency: 0.2 });
  gm.add('urgent analysis', { importance: 0.95, urgency: 0.9 });
  gm.add('weekly summary', { importance: 0.5, urgency: 0.4 });

  const order = gm.pending().map((g) => g.text);
  assert.equal(order[0], 'urgent analysis');
  assert.equal(order[order.length - 1], 'low chore');
});

test('goals: an imminent deadline raises priority', () => {
  const gm = new GoalManager();
  const relaxed = gm.add('no deadline', { importance: 0.5 });
  const pressing = gm.add('due very soon', { importance: 0.5, deadline: Date.now() + 1000 });

  const pr = gm.priority(gm.get(pressing.id));
  const rr = gm.priority(gm.get(relaxed.id));
  assert.ok(pr > rr, 'the goal with an imminent deadline should score higher');
});

test('goals: an overdue deadline gets maximum deadline pressure', () => {
  const gm = new GoalManager();
  const overdue = gm.add('past due', { importance: 0.4, deadline: Date.now() - 5000 });
  const future = gm.add('far off', { importance: 0.4, deadline: Date.now() + 10 * 3600_000 });
  assert.ok(gm.priority(gm.get(overdue.id)) > gm.priority(gm.get(future.id)));
});

test('goals: waiting longer increases priority (aging)', () => {
  const gm = new GoalManager({ agingHalfLifeMs: 1000 });
  const g = gm.add('patient goal', { importance: 0.5, urgency: 0.5 });
  const now = Date.now();
  const fresh = gm.priority(gm.get(g.id), now);
  const aged = gm.priority(gm.get(g.id), now + 5000); // 5 half-lives later
  assert.ok(aged > fresh, 'an older pending goal should score higher');
});

// ── lifecycle ─────────────────────────────────────────────────────────────
test('goals: next() returns the top goal and marks it active', () => {
  const gm = new GoalManager();
  gm.add('a', { importance: 0.3 });
  gm.add('b', { importance: 0.9 });
  const top = gm.next();
  assert.equal(top.text, 'b');
  assert.equal(gm.get(top.id).status, 'active');
  // b is now active, so the next pending is a
  assert.equal(gm.pending()[0].text, 'a');
});

test('goals: complete / fail / requeue transition status correctly', () => {
  const gm = new GoalManager();
  const g = gm.add('task', { importance: 0.5 });
  gm.next();
  gm.complete(g.id);
  assert.equal(gm.get(g.id).status, 'done');

  const g2 = gm.add('task2', { importance: 0.5 });
  gm.fail(g2.id);
  assert.equal(gm.get(g2.id).status, 'failed');

  gm.requeue(g2.id);
  assert.equal(gm.get(g2.id).status, 'pending');
});

test('goals: stats and prune reflect the workload', () => {
  const gm = new GoalManager();
  const a = gm.add('a');
  const b = gm.add('b');
  gm.add('c');
  gm.complete(a.id);
  gm.fail(b.id);

  let s = gm.stats();
  assert.equal(s.total, 3);
  assert.equal(s.done, 1);
  assert.equal(s.failed, 1);
  assert.equal(s.pending, 1);

  const removed = gm.prune();
  assert.equal(removed, 2, 'done + failed should be pruned');
  assert.equal(gm.stats().total, 1);
});

// ── robustness ────────────────────────────────────────────────────────────
test('goals: empty text is rejected, bad ids are safe', () => {
  const gm = new GoalManager();
  assert.equal(gm.add('   '), null);
  assert.equal(gm.add(''), null);
  assert.equal(gm.complete('nonexistent'), null);
  assert.equal(gm.next(), null, 'no goals → next() is null');
});

test('goals: clamps importance/urgency into [0,1]', () => {
  const gm = new GoalManager();
  const g = gm.add('x', { importance: 5, urgency: -3 });
  assert.equal(gm.get(g.id).importance, 1);
  assert.equal(gm.get(g.id).urgency, 0);
});
