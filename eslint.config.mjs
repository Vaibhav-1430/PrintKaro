import { baseConfig } from '@print-karo/config-eslint/base';

/**
 * Root ESLint flat config. Each app/package also ships its own
 * eslint.config that extends the appropriate shared preset.
 * @type {import("eslint").Linter.Config[]}
 */
export default [
  ...baseConfig,
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/*.config.{js,cjs,mjs,ts}',
    ],
  },
];
