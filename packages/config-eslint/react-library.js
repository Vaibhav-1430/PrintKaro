import globals from 'globals';
import { baseConfig } from './base.js';

/**
 * ESLint flat config for shared React libraries (e.g. @print-karo/ui).
 * @type {import("eslint").Linter.Config[]}
 */
export const reactLibraryConfig = [
  ...baseConfig,
  {
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
];

export default reactLibraryConfig;
