// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang).
// Dual-licensed: GNU AGPL-3.0-or-later (see /LICENSE) OR a commercial license
// (see /COMMERCIAL-LICENSE.md). The PAD formulae, coordinate values, and algorithms
// herein are original works of the author (see the CogMesh Technical Whitepaper).
// This program is free software: redistribute/modify under the AGPL; it comes with
// NO WARRANTY. If you run a modified version over a network, the AGPL requires you to
// offer its complete source to users.

// src/core/world/worldAdapter.js
// CogMesh Sprint 15C — World Model connection adapter
//
// Detects tickers/companies in conversation text and registers them as objects in the global World Model.
// Does not touch the finance engine's internals at all (a thin external connection = loose coupling).
//
// Honest scope:
//   - the "ticker detection" here is based on a known list + a 6-digit ticker-code regex.
//     it is not full NER (named-entity recognition), just a practical level that catches well-known tickers.
//   - undetected tickers are simply not registered; the app's behavior is unaffected.

import { worldModel } from '../instances.js';

// Dictionary of well-known tickers/companies (id, display name, aliases)
const KNOWN_ENTITIES = [
  { id: 'samsung',    name: '삼성전자',   aliases: ['삼성전자', 'samsung', '005930'] },
  { id: 'skhynix',    name: 'SK하이닉스', aliases: ['하이닉스', 'sk하이닉스', 'hynix', '000660'] },
  { id: 'naver',      name: '네이버',     aliases: ['네이버', 'naver', '035420'] },
  { id: 'kakao',      name: '카카오',     aliases: ['카카오', 'kakao', '035720'] },
  { id: 'hyundai',    name: '현대차',     aliases: ['현대차', '현대자동차', 'hyundai', '005380'] },
  { id: 'lgensol',    name: 'LG에너지솔루션', aliases: ['lg에너지', 'lg엔솔', '에너지솔루션', '373220'] },
  { id: 'tsmc',       name: 'TSMC',       aliases: ['tsmc', '대만반도체'] },
  { id: 'nvidia',     name: '엔비디아',   aliases: ['엔비디아', 'nvidia'] },
  { id: 'apple',      name: '애플',       aliases: ['애플', 'apple'] },
  { id: 'tesla',      name: '테슬라',     aliases: ['테슬라', 'tesla'] },
];

// 6-digit ticker-code regex
const TICKER_RX = /\b(\d{6})\b/g;

/**
 * Detect known tickers in text.
 * @param {string} text
 * @returns {Array<{ id: string, name: string }>}
 */
export function detectEntities(text) {
  if (!text || typeof text !== 'string') return [];
  const lower = text.toLowerCase();
  const found = new Map();

  for (const ent of KNOWN_ENTITIES) {
    if (ent.aliases.some((a) => lower.includes(a.toLowerCase()))) {
      found.set(ent.id, { id: ent.id, name: ent.name });
    }
  }

  // Also register 6-digit codes not in the dictionary (id = code_XXXXXX)
  let m;
  while ((m = TICKER_RX.exec(text)) !== null) {
    const code = m[1];
    const known = KNOWN_ENTITIES.find((e) => e.aliases.includes(code));
    if (!known && !found.has(`code_${code}`)) {
      found.set(`code_${code}`, { id: `code_${code}`, name: code });
    }
  }

  return Array.from(found.values());
}

/**
 * Process conversation text and register detected tickers into the global World Model.
 * If the same ticker is mentioned multiple times, increment mentionCount.
 * @param {string} text
 * @param {{ role?: 'user'|'assistant' }} [meta]
 * @returns {Array<{ id: string, name: string }>} tickers detected this time
 */
export function ingestText(text, meta = {}) {
  const entities = detectEntities(text);

  for (const ent of entities) {
    const existing = worldModel.getObject(ent.id);
    const prevCount = existing?.attrs?.mentionCount || 0;
    worldModel.addObject({
      id: ent.id,
      attrs: {
        name: ent.name,
        mentionCount: prevCount + 1,
        lastRole: meta.role || 'user',
      },
    });
  }

  return entities;
}

/** global World Model snapshot (for UI display) */
export function getWorldSnapshot() {
  return worldModel.snapshot();
}
