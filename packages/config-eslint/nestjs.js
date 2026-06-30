import globals from 'globals';
import { baseConfig } from './base.js';

/**
 * ESLint flat config for NestJS apps.
 * @type {import("eslint").Linter.Config[]}
 */
export const nestjsConfig = [
  ...baseConfig,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        sourceType: 'module',
      },
    },
    rules: {
      // NestJS relies heavily on decorator metadata + DI. Injected services
      // must be *value* imports (DI tokens), so type-only import enforcement
      // fights the framework — disable it for Nest apps.
      '@typescript-eslint/consistent-type-imports': 'off',
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/interface-name-prefix': 'off',
    },
  },
];

export default nestjsConfig;
