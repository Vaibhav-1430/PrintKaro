import { defineConfig } from 'tsup';

export default defineConfig((options) => ({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  // Clean only for one-shot builds. In --watch we rebuild in place so we
  // never delete dist out from under a consumer that is reading it.
  clean: !options.watch,
  minify: false,
  target: 'es2022',
  // zod is a peer-shared runtime dep; consumers provide their own copy.
  external: ['zod'],
}));
