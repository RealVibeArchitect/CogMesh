// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// examples/loader.mjs — a tiny resolver so the bundler-style (extensionless) imports
// in core/ also run under plain Node. Use it like:
//
//   node --loader ./examples/loader.mjs examples/ollama.mjs "your prompt"
//
// (In a bundler such as Vite/webpack you don't need this — extensionless imports
//  resolve automatically there.)

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  const isRelative = specifier.startsWith('./') || specifier.startsWith('../');
  const hasExt = /\.(mjs|cjs|js|json)$/.test(specifier);
  if (isRelative && !hasExt) {
    // try `<specifier>.js`, then `<specifier>/index.js`
    for (const cand of [specifier + '.js', specifier + '/index.js']) {
      try {
        const resolved = await nextResolve(cand, context);
        if (resolved?.url && existsSync(fileURLToPath(resolved.url))) return resolved;
      } catch { /* keep trying */ }
    }
  }
  return nextResolve(specifier, context);
}
