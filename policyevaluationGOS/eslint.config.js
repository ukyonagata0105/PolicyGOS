import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'release/**',
      'resources/backend/**',
      'playwright-report/**',
      'public/**',
      'scripts/**',
      'electron/**',
      'tests/e2e/**',
      'test-*.mjs',
      'test-*.cjs',
      'vite.config.ts',
      'vitest.config.ts',
      'playwright.config.ts',
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'ollama/**/*.ts', 'env.d.ts'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-explicit-any': 'off',
    },
  }
);
