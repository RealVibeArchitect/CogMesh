// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// core/util/logger.js — a tiny, dependency-free leveled logger.
//
// Why this exists: the core scatters a few console.warn calls. A library shouldn't
// hard-code console output — a host app may want to silence it, raise the level, or
// pipe logs into its own system. This logger keeps the core dependency-free while
// giving one consistent, controllable entry point.
//
//   import { logger } from '../util/logger.js';
//   logger.warn('EngineRegistry', "engine 'x' already registered; overwriting");
//
// Control it from the host app:
//   logger.setLevel('error');           // only errors
//   logger.setLevel('silent');          // nothing (great for tests / embedding)
//   logger.setSink((lvl, tag, args) => myLog(lvl, tag, ...args)); // custom sink
//
// Levels, low → high:  debug < info < warn < error < silent
// Default level is 'warn' (matches the original console.warn behavior).

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

let currentLevel = LEVELS.warn;
let sink = defaultSink;

function defaultSink(level, tag, args) {
  // Map to the closest console method; fall back to console.log.
  const fn =
    level === 'error' ? console.error :
    level === 'warn' ? console.warn :
    level === 'info' ? console.info :
    console.log;
  fn(`[${tag}]`, ...args);
}

function emit(level, tag, args) {
  if (LEVELS[level] < currentLevel) return; // below threshold → drop
  try {
    sink(level, tag, args);
  } catch {
    // a broken sink must never crash the caller
  }
}

export const logger = {
  /** Set the minimum level to emit. Accepts: debug|info|warn|error|silent. */
  setLevel(level) {
    if (level in LEVELS) currentLevel = LEVELS[level];
    return this;
  },
  /** Current level name. */
  getLevel() {
    return Object.keys(LEVELS).find((k) => LEVELS[k] === currentLevel) ?? 'warn';
  },
  /** Replace the output sink. `fn(level, tag, argsArray)`. Pass null to restore default. */
  setSink(fn) {
    sink = typeof fn === 'function' ? fn : defaultSink;
    return this;
  },
  debug(tag, ...args) { emit('debug', tag, args); },
  info(tag, ...args) { emit('info', tag, args); },
  warn(tag, ...args) { emit('warn', tag, args); },
  error(tag, ...args) { emit('error', tag, args); },
};

export { LEVELS };
