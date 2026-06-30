import { defineConfig } from 'tsup';

export default defineConfig((options) => ({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  // Clean only for one-shot builds; rebuild in place while watching.
  clean: !options.watch,
  target: 'es2022',
  // Prisma client is a runtime dependency resolved from node_modules.
  external: ['@prisma/client'],
}));
