import { defineConfig } from 'vite-plus';

export default defineConfig({
  staged: {
    '*': 'vp check --fix',
    'apps/tui/**/*.go': 'gofmt -w',
  },
  fmt: {
    singleQuote: true,
    ignorePatterns: [
      'dist/**',
      'node_modules/**',
      '.turbo/**',
      'apps/api/out/**',
      'apps/tui/bin/**',
    ],
  },
  lint: {
    ignorePatterns: [
      'dist/**',
      'node_modules/**',
      '.turbo/**',
      'apps/api/out/**',
      'apps/tui/bin/**',
    ],
    jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
    rules: { 'vite-plus/prefer-vite-plus-imports': 'error' },
    options: { typeAware: true, typeCheck: true },
  },
  test: {
    include: ['apps/**/*.test.ts'],
  },
});
