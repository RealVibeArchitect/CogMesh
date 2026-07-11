// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang).
// Dual-licensed: GNU AGPL-3.0-or-later (see /LICENSE) OR a commercial license
// (see /COMMERCIAL-LICENSE.md). The PAD formulae, coordinate values, and algorithms
// herein are original works of the author (see the CogMesh Technical Whitepaper).
// This program is free software: redistribute/modify under the AGPL; it comes with
// NO WARRANTY. If you run a modified version over a network, the AGPL requires you to
// offer its complete source to users.

// src/core/orchestration/inputTransform.js
// CogMesh Sprint 20 — S-Infinity Scaling (input transform layer)
//
// Design (spec item 7):
//   "Do not modify attention itself. Transform the input before attention."
//   X' = T_θ(X)  →  Q,K,V = f(X')
//   The Transformer stays as-is; only the input representation is transformed dynamically.
//
// Honest implementation (respecting web-app reality):
//   A true T_θ changes the model's internal embeddings via learned parameters → needs Python/PyTorch.
//   Our web app only calls Gemma from the outside, so it cannot touch the model's internals.
//
//   Instead we implement "input representation transform" as the part that really works
//   in the web app = reconstructing the prompt right before handing it to the LLM. This
//   matches the spec's spirit ("transform the input before attention") exactly.
//
//   And in place of θ (learned parameters), we use "cognition-based" transform rules:
//   the cognitive results built so far (PAD metacognition, World Model, Bounded Rationality)
//   actually participate in transforming the input. (Layers that only observed now change the input!)
//
// If a true learned T_θ is needed, split it into a separate Python (RTX 4050 LoRA) path.

import { getWorldSnapshot } from '../world/worldAdapter.js';

/**
 * Transform input X into X' according to cognitive state (a cognition-based approximation of T_θ).
 *
 * @param {string} baseInput - the original user input X (or a base prompt built by an engine)
 * @param {{
 *   metacognition?: object,   // PAD metacognition (reasoning stance)
 *   budget?: object,          // Bounded Rationality budget
 *   lang?: 'ko'|'en',
 *   includeWorld?: boolean,   // whether to inject World Model context
 * }} [cognition]
 * @returns {{ transformed: string, injected: string[] }}
 *   transformed: the transformed input X'
 *   injected: which cognitive contexts were injected (for debugging/display)
 */
export function transformInput(baseInput, cognition = {}) {
  const lang = cognition.lang || 'en';
  const injected = [];
  const prefixParts = [];

  // (1) Inject reasoning stance — turn the PAD metacognition result into "how to answer" guidance
  const stance = cognition.metacognition?.params;
  if (stance) {
    const stanceHint = stanceToHint(stance, lang);
    if (stanceHint) {
      prefixParts.push(stanceHint);
      injected.push('stance');
    }
  }

  // (2) Inject compute budget — a hint about answer detail (shallow vs deep)
  const budget = cognition.budget;
  if (budget) {
    const depthHint = budgetToHint(budget, lang);
    if (depthHint) {
      prefixParts.push(depthHint);
      injected.push('budget');
    }
  }

  // (3) Inject World Model context — tickers discussed in the conversation as background knowledge
  if (cognition.includeWorld) {
    const worldHint = worldToHint(lang);
    if (worldHint) {
      prefixParts.push(worldHint);
      injected.push('world');
    }
  }

  // Transform: prepend the cognitive context to the prompt (X → X')
  if (prefixParts.length === 0) {
    return { transformed: baseInput, injected: [] };
  }

  const header = lang === 'en'
    ? `[Cognitive context]\n${prefixParts.join('\n')}\n\n[Request]\n`
    : `[인지 맥락]\n${prefixParts.join('\n')}\n\n[요청]\n`;

  return { transformed: header + baseInput, injected };
}

/** reasoning stance → answer-posture hint */
function stanceToHint(params, lang) {
  // pick the single most prominent trait and translate it into an answer posture
  const dominant = Object.entries(params).sort((a, b) => b[1] - a[1])[0];
  if (!dominant || dominant[1] < 0.4) return null;
  const [trait] = dominant;

  const HINTS = {
    caution:       { ko: '- 신중하게, 리스크와 불확실성을 함께 짚으며 답하세요.', en: '- Answer cautiously, noting risks and uncertainties.' },
    assertiveness: { ko: '- 명확하고 단정적으로, 핵심 결론을 앞세워 답하세요.', en: '- Answer clearly and decisively, leading with the key conclusion.' },
    exploration:   { ko: '- 여러 관점과 대안을 탐색적으로 제시하며 답하세요.', en: '- Answer exploratively, offering multiple angles and alternatives.' },
    openness:      { ko: '- 열린 태도로 폭넓게 답하세요.', en: '- Answer with an open, broad perspective.' },
  };
  return HINTS[trait]?.[lang] || null;
}

/** budget → answer-detail hint */
function budgetToHint(budget, lang) {
  const tokens = budget.maxTokens || 800;
  if (tokens <= 200) {
    return lang === 'en' ? '- Keep it very brief (1-2 sentences).' : '- 아주 간결하게 (1~2문장) 답하세요.';
  }
  if (tokens <= 400) {
    return lang === 'en' ? '- Keep it concise.' : '- 간결하게 답하세요.';
  }
  if (tokens >= 1500) {
    return lang === 'en' ? '- Provide a thorough, step-by-step analysis.' : '- 단계별로 충실하게 분석해 답하세요.';
  }
  return null; // STANDARD has no hint (default)
}

/** World Model → background-context hint */
function worldToHint(lang) {
  try {
    const snap = getWorldSnapshot();
    if (!snap.objects.length) return null;

    // a few most-mentioned tickers as background
    const top = [...snap.objects]
      .sort((a, b) => (b.attrs?.mentionCount || 0) - (a.attrs?.mentionCount || 0))
      .slice(0, 4)
      .map((o) => o.attrs?.name || o.id);

    if (!top.length) return null;

    return lang === 'en'
      ? `- Conversation so far has focused on: ${top.join(', ')}.`
      : `- 지금까지 대화에서 다룬 대상: ${top.join(', ')}.`;
  } catch {
    return null;
  }
}
