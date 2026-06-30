import { defineConfig } from 'tsup';

export default defineConfig((options) => ({
  entry: ['src/index.ts', 'src/client.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  // Clean only for one-shot builds; rebuild in place while watching.
  clean: !options.watch,
  target: 'es2022',
  // Resolved from node_modules at runtime; not bundled.
  external: ['better-auth', '@print-karo/database', '@prisma/client', 'react'],
}));
