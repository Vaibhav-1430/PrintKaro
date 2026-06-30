import { baseConfig } from '@print-karo/config-eslint/base';
import globals from 'globals';

export default [
  ...baseConfig,
  {
    languageOptions: { globals: { ...globals.node } },
  },
];
