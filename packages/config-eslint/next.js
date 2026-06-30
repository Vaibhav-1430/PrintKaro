import globals from 'globals';
import { baseConfig } from './base.js';

/**
 * ESLint flat config for Next.js apps.
 * Apps additionally extend `next/core-web-vitals` via their own flat config
 * (FlatCompat) so the Next plugin version stays owned by the app.
 * @type {import("eslint").Linter.Config[]}
 */
export const nextConfig = [
  ...baseConfig,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // Next uses its own parser without type info; this rule needs typed
      // linting, so disable it for the Next apps.
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
  {
    // Never lint config files, generated type decls, or build output.
    ignores: ['**/*.config.{js,cjs,mjs,ts}', 'next-env.d.ts', '.next/**', 'node_modules/**'],
  },
];

export default nextConfig;
