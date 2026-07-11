// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
//
// ESLint flat config (ESLint 9+). Dev-only — it lints the source but adds NO
// runtime dependency to the dependency-free core. Run with:
//
//   npm run lint        # report problems
//   npm run lint:fix    # auto-fix what's safely fixable
//
// Philosophy: catch real bugs (unused vars, unreachable code, accidental globals),
// not bikeshed style. Keep the noise low so warnings stay meaningful.

export default [
  {
    files: ['**/*.js', '**/*.mjs'],
    ignores: ['node_modules/**', 'site/**', 'dist-docs/**'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        // Node.js runtime globals used across the project
        process: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        performance: 'readonly',
        structuredClone: 'readonly',
        Buffer: 'readonly',
      },
    },
    rules: {
      // ── real bugs ──────────────────────────────────────────────
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-const-assign': 'error',
      'no-self-compare': 'warn',
      'no-constant-condition': ['warn', { checkLoops: false }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'valid-typeof': 'error',
      'use-isnan': 'error',
    },
  },
];
