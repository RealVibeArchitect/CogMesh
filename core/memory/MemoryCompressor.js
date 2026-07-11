// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/memory/MemoryCompressor.js — dependency-free episodic memory compression.
//
// The problem it solves: bounded memory (EpisodeMemory caps at N turns) protects
// against leaks, but it does so by *throwing old turns away*. That loses history.
// Compression keeps the gist: before old turns are evicted, summarize them into a
// compact record so the agent still "remembers roughly what happened" long after the
// verbatim turns are gone.
//
// This is a *statistical* summarizer (no LLM needed): it extracts the dominant
// keywords, speaker balance, time span, and a short excerpt. If you have an LLM,
// you can plug it in via a custom summarize function — see EpisodeMemory({ summarizer }).
//
//   import { compressTurns } from './MemoryCompressor.js';
//   const summary = compressTurns(oldTurns);
//   // → { kind:'summary', count, span, roles, keywords, gist, t }

// Very small multilingual stopword set (EN + KO particles/fillers). Kept tiny on
// purpose — this is a gist extractor, not a linguistics engine.
const STOPWORDS = new Set([
  // English
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'to', 'of', 'and', 'or',
  'in', 'on', 'at', 'for', 'with', 'that', 'this', 'it', 'i', 'you', 'me', 'my',
  'we', 'do', 'does', 'did', 'so', 'but', 'if', 'as', 'about', 'what', 'how',
  // Korean particles / very common fillers
  '이', '그', '저', '것', '수', '등', '및', '을', '를', '은', '는', '에', '의',
  '가', '도', '로', '으로', '와', '과', '해', '좀', '더', '나', '내', '그리고',
]);

function tokenize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // strip punctuation, keep letters/numbers (any language)
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));
}

/**
 * Summarize an array of turns into one compact record.
 * @param {Array<{role?:string,text:string,t?:number}>} turns
 * @param {{ topKeywords?: number, gistChars?: number }} [opts]
 * @returns {{kind:'summary',count:number,span:{from:number,to:number},roles:object,keywords:string[],gist:string,t:number}|null}
 */
export function compressTurns(turns, opts = {}) {
  if (!Array.isArray(turns) || turns.length === 0) return null;
  const topKeywords = opts.topKeywords ?? 6;
  const gistChars = opts.gistChars ?? 160;

  // keyword frequency across all turns
  const freq = new Map();
  const roles = {};
  let earliest = Infinity;
  let latest = -Infinity;

  for (const turn of turns) {
    const role = turn.role || 'user';
    roles[role] = (roles[role] || 0) + 1;
    if (typeof turn.t === 'number') {
      earliest = Math.min(earliest, turn.t);
      latest = Math.max(latest, turn.t);
    }
    for (const tok of tokenize(turn.text)) {
      freq.set(tok, (freq.get(tok) || 0) + 1);
    }
  }

  const keywords = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topKeywords)
    .map(([w]) => w);

  // a short human-readable gist: dominant keywords + first/last snippet
  const first = turns[0].text.slice(0, 40).trim();
  const last = turns[turns.length - 1].text.slice(0, 40).trim();
  let gist = keywords.length
    ? `${turns.length} turns, mainly about: ${keywords.join(', ')}`
    : `${turns.length} turns`;
  gist += ` — from “${first}…” to “${last}…”`;
  if (gist.length > gistChars) gist = gist.slice(0, gistChars - 1) + '…';

  return {
    kind: 'summary',
    count: turns.length,
    span: {
      from: earliest === Infinity ? null : earliest,
      to: latest === -Infinity ? null : latest,
    },
    roles,
    keywords,
    gist,
    t: Date.now(),
  };
}
