// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang).
// Dual-licensed: GNU AGPL-3.0-or-later (see /LICENSE) OR a commercial license
// (see /COMMERCIAL-LICENSE.md). The PAD formulae, coordinate values, and algorithms
// herein are original works of the author (see the CogMesh Technical Whitepaper).
// This program is free software: redistribute/modify under the AGPL; it comes with
// NO WARRANTY. If you run a modified version over a network, the AGPL requires you to
// offer its complete source to users.

// scripts/check-pad-sync.mjs
// CogMesh — guard the PAD coordinate system against JS/Python drift.
//
// The 20 core-emotion PAD coordinates exist in TWO places that MUST agree:
//   - core/pad/emotionMap.js        (the web-app / cognition core — source of truth)
//   - training/src/utils.py         (CORE_EMOTIONS — drives the trained encoder's metrics)
//
// If these drift apart, the trained model learns a different coordinate system than the
// one the app reasons in — a silent, hard-to-debug correctness bug. This script parses
// both files and fails (exit 1) on any missing emotion or mismatched coordinate, so a
// one-sided edit is caught immediately (run it in CI or before a release).
//
//   node scripts/check-pad-sync.mjs
//   npm run check:pad-sync

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const EPS = 1e-9;

// ── parse the JS source of truth ────────────────────────────────────────────
function parseJs() {
  const text = readFileSync(join(ROOT, 'core/pad/emotionMap.js'), 'utf-8');
  const re = /id:\s*'(\w+)'[\s\S]*?p:\s*(-?[\d.]+),\s*a:\s*(-?[\d.]+),\s*d:\s*(-?[\d.]+)/g;
  const map = new Map();
  for (const m of text.matchAll(re)) {
    map.set(m[1], [Number(m[2]), Number(m[3]), Number(m[4])]);
  }
  return map;
}

// ── parse the Python CORE_EMOTIONS list ─────────────────────────────────────
// each entry: ("id", "한글", p, a, d)
function parsePy() {
  const text = readFileSync(join(ROOT, 'training/src/utils.py'), 'utf-8');
  const block = text.slice(text.indexOf('CORE_EMOTIONS'));
  const re = /\("(\w+)",\s*"[^"]*",\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\)/g;
  const map = new Map();
  for (const m of block.matchAll(re)) {
    map.set(m[1], [Number(m[2]), Number(m[3]), Number(m[4])]);
  }
  return map;
}

const js = parseJs();
const py = parsePy();

const problems = [];
for (const id of js.keys()) if (!py.has(id)) problems.push(`missing in Python: '${id}'`);
for (const id of py.keys()) if (!js.has(id)) problems.push(`missing in JS: '${id}'`);
for (const [id, jv] of js) {
  const pv = py.get(id);
  if (!pv) continue;
  if (jv.some((v, i) => Math.abs(v - pv[i]) > EPS)) {
    problems.push(`coordinate mismatch '${id}': JS=[${jv}] Python=[${pv}]`);
  }
}

if (js.size === 0 || py.size === 0) {
  console.error(`✗ parse failure — JS parsed ${js.size}, Python parsed ${py.size} emotions`);
  process.exit(1);
}

if (problems.length) {
  console.error(`✗ PAD coordinates are OUT OF SYNC (${problems.length} issue(s)):`);
  for (const p of problems) console.error(`   - ${p}`);
  console.error('\n  Fix: make core/pad/emotionMap.js and training/src/utils.py agree.');
  process.exit(1);
}

console.log(`✓ PAD coordinates in sync — ${js.size} emotions match across JS and Python.`);
