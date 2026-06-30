import { FlatCompat } from '@eslint/eslintrc';
import { nextConfig } from '@print-karo/config-eslint/next';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default [
  ...nextConfig,
  ...compat.extends('next/core-web-vitals'),
  { ignores: ['.next/**', 'node_modules/**'] },
];
