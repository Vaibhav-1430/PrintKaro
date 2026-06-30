/** @type {import('lint-staged').Configuration} */
module.exports = {
  '*.{ts,tsx,js,jsx,cjs,mjs}': ['prettier --write'],
  '*.{json,md,yml,yaml,css}': ['prettier --write'],
};
