// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang).
// Dual-licensed: GNU AGPL-3.0-or-later (see /LICENSE) OR a commercial license
// (see /COMMERCIAL-LICENSE.md). The PAD formulae, coordinate values, and algorithms
// herein are original works of the author (see the CogMesh Technical Whitepaper).
// This program is free software: redistribute/modify under the AGPL; it comes with
// NO WARRANTY. If you run a modified version over a network, the AGPL requires you to
// offer its complete source to users.

// src/core/pad/emotionMap.js
// CogMesh Sprint 11 — PAD 20-core-emotion mapping table
//
// Source: [appendix] URI Emotion Engine: precise mapping data for the 20 core
//         emotions (2026.02.27) — Document 03: 3-axis coordinate mapping table.
//
// Coordinate system: P (pleasure) / A (arousal) / D (dominance),
// each axis normalized to [-1, +1].
//
// This file holds pure data (constants) only — logic lives in nearestEmotion.js
// and padState.js.

export const EMOTIONS = [
  { id: 'elated',     label: { ko: '환희',   en: 'Elated'     }, p:  1.0, a:  0.7, d:  0.8 },
  { id: 'serene',      label: { ko: '평온',   en: 'Serene'     }, p:  0.6, a: -0.6, d:  0.4 },
  { id: 'proud',       label: { ko: '자신감', en: 'Proud'      }, p:  0.7, a:  0.3, d:  1.0 },
  { id: 'excited',     label: { ko: '흥분',   en: 'Excited'    }, p:  0.8, a:  0.1, d:  0.5 },
  { id: 'relieved',    label: { ko: '안도',   en: 'Relieved'   }, p:  0.5, a: -0.5, d:  0.3 },
  { id: 'grateful',    label: { ko: '감사',   en: 'Grateful'   }, p:  0.9, a: -0.2, d:  0.2 },
  { id: 'optimistic',  label: { ko: '낙관',   en: 'Optimistic' }, p:  0.7, a:  0.3, d:  0.6 },
  { id: 'awe',         label: { ko: '경외',   en: 'Awe'        }, p:  0.8, a:  0.4, d: -0.2 },
  { id: 'curious',     label: { ko: '호기심', en: 'Curious'    }, p:  0.4, a:  0.6, d:  0.2 },
  { id: 'angry',       label: { ko: '분노',   en: 'Angry'      }, p: -0.8, a:  0.9, d:  0.4 },
  { id: 'lethargic',   label: { ko: '무기력', en: 'Lethargic'  }, p: -0.6, a: -0.9, d: -0.8 },
  { id: 'ashamed',     label: { ko: '수치심', en: 'Ashamed'    }, p: -0.7, a: -0.2, d: -0.1 },
  { id: 'sad',         label: { ko: '슬픔',   en: 'Sad'        }, p: -0.8, a: -0.4, d: -0.6 },
  { id: 'disgust',     label: { ko: '혐오',   en: 'Disgust'    }, p: -0.9, a:  0.2, d:  0.1 },
  { id: 'tense',       label: { ko: '긴장',   en: 'Tense'      }, p: -0.2, a:  0.8, d: -0.3 },
  { id: 'puzzled',     label: { ko: '당혹',   en: 'Puzzled'    }, p: -0.1, a:  0.5, d: -0.2 },
  { id: 'bored',       label: { ko: '지루함', en: 'Bored'      }, p: -0.3, a: -0.7, d: -0.2 },
  { id: 'envy',        label: { ko: '질투',   en: 'Envy'       }, p: -0.6, a:  0.4, d: -0.5 },
  { id: 'panic',       label: { ko: '공포',   en: 'Panic'      }, p: -0.9, a:  1.0, d: -0.7 },
  { id: 'vigilant',    label: { ko: '경계',   en: 'Vigilant'   }, p: -0.2, a:  0.6, d:  0.3 },
];

// Index for fast lookup by id
export const EMOTION_BY_ID = Object.fromEntries(EMOTIONS.map((e) => [e.id, e]));
