import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // dist/: build output. The root scripts listed here are local-only
  // experiments that read data outside the repo (see SETUP.md); they're not
  // part of the app, the CLI or the test suite.
  globalIgnores([
    'dist', 'dist-cli', 'release', 'electron/desktop-export.cjs',
    'baseline.ts', 'baseline2.ts', 'baseline_run.ts', 'simulate.ts', 'audit_modality.ts', 'test_*.ts',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // A leading underscore marks a parameter or variable kept on purpose
      // (an unused interface argument, a destructured field being dropped).
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
])
