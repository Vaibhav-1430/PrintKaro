import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';
import onlyWarn from 'eslint-plugin-only-warn';

/**
 * Shared base ESLint flat config for the Print Karo monorepo.
 * @type {import("eslint").Linter.Config[]}
 */
export const baseConfig = [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    plugins: { onlyWarn },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': 'warn',
      // Discourage stray console use; intentional logging (seeds, error
      // boundaries) opts in explicitly with a local eslint-disable.
      'no-console': 'warn',
    },
  },
  {
    ignores: ['dist/**', '.next/**', 'node_modules/**', '.turbo/**', 'coverage/**'],
  },
];

export default baseConfig;
