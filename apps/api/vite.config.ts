import { defineConfig } from 'vite-plus';

export default defineConfig({
  // tsdown keeps package.json dependencies external by default, which is what
  // Playwright needs to find its browser install.
  pack: {
    entry: ['src/cli.ts', 'src/server.ts'],
    format: ['esm'],
    platform: 'node',
    target: 'node24',
    dts: false,
    clean: true,
  },
});
