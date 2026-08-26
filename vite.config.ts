import { defineConfig } from 'vite-plus';

export default defineConfig({
  run: {
    cache: { tasks: true, scripts: false },
    tasks: {
      // CI/repeatable workflows only. Dev/start/scraper scripts stay uncached.
      check: {
        command: 'vp check',
        input: [
          { auto: true },
          '!apps/api/dist',
          '!apps/api/dist/**',
          '!apps/api/out',
          '!apps/api/out/**',
          '!apps/web/dist',
          '!apps/web/dist/**',
          '!apps/web/node_modules/.tmp',
          '!apps/web/node_modules/.tmp/**',
          '!apps/web/node_modules/.vite-temp',
          '!apps/web/node_modules/.vite-temp/**',
          '!apps/tui/bin',
          '!apps/tui/bin/**',
        ],
      },
      test: {
        command: ['vp test run', 'cd apps/tui && go test ./...'],
        input: [
          { auto: true },
          '!apps/api/dist',
          '!apps/api/dist/**',
          '!apps/api/out',
          '!apps/api/out/**',
          '!apps/web/dist',
          '!apps/web/dist/**',
          '!apps/web/node_modules/.tmp',
          '!apps/web/node_modules/.tmp/**',
          '!apps/web/node_modules/.vite-temp',
          '!apps/web/node_modules/.vite-temp/**',
          '!apps/tui/bin',
          '!apps/tui/bin/**',
        ],
      },
      build: {
        command: [
          '(cd apps/api && tsc --noEmit)',
          '(cd apps/api && vp pack)',
          '(cd apps/web && tsc -b)',
          '(cd apps/web && vp exec vite build)',
          '(cd apps/tui && go build -o bin/is-dl-tui .)',
        ],
        env: ['NODE_ENV', 'VITE_*'],
        input: [
          { auto: true },
          '!apps/api/dist',
          '!apps/api/dist/**',
          '!apps/api/out',
          '!apps/api/out/**',
          '!apps/web/dist',
          '!apps/web/dist/**',
          '!apps/web/node_modules/.tmp',
          '!apps/web/node_modules/.tmp/**',
          '!apps/web/node_modules/.vite-temp',
          '!apps/web/node_modules/.vite-temp/**',
          '!apps/tui/bin',
          '!apps/tui/bin/**',
        ],
        output: [
          { pattern: 'apps/api/dist/**', base: 'workspace' },
          { pattern: 'apps/web/dist/**', base: 'workspace' },
          { pattern: 'apps/tui/bin/**', base: 'workspace' },
        ],
      },
    },
  },
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
      'apps/api/dist/**',
      'apps/api/out/**',
      'apps/tui/bin/**',
    ],
  },
  lint: {
    ignorePatterns: [
      'dist/**',
      'node_modules/**',
      '.turbo/**',
      'apps/api/dist/**',
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
