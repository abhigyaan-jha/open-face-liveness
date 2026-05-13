import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';

const tsconfigRootDir = path.dirname(fileURLToPath(import.meta.url));

const tsFiles = [
  'src/**/*.ts',
  'demo/browser/src/**/*.{ts,tsx}',
  'vite.config.ts',
];

const jsFiles = [
  'scripts/**/*.mjs',
  'eslint.config.js',
];

export default tseslint.config(
  {
    ignores: [
      'coverage/**',
      'dist/**',
      'licenses/**',
      'models/**',
      'node_modules/**',
      'vendor/**',
    ],
  },
  {
    ...js.configs.recommended,
    files: jsFiles,
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.node,
      sourceType: 'module',
    },
  },
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: tsFiles,
    languageOptions: {
      ...config.languageOptions,
      ecmaVersion: 'latest',
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
      parserOptions: {
        ...config.languageOptions?.parserOptions,
        projectService: {
          allowDefaultProject: ['vite.config.ts'],
        },
        tsconfigRootDir,
      },
      sourceType: 'module',
    },
    rules: {
      ...config.rules,
      'no-undef': 'off',
    },
  })),
  {
    files: tsFiles,
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          fixStyle: 'inline-type-imports',
          prefer: 'type-imports',
        },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      'prefer-const': ['error', { ignoreReadBeforeAssign: true }],
    },
  },
  {
    files: ['demo/browser/src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/exhaustive-deps': 'error',
      'react-hooks/rules-of-hooks': 'error',
    },
  },
);
