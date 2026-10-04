import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite-plus';

// The app calls `/api` on its own origin. Dev and preview forward it to `is-dl serve`,
// so the API's address is chosen when the server starts, not baked into the build.
const api = process.env.IS_DL_API_URL ?? 'http://localhost:3000';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: true,
    proxy: { '/api': api },
  },
});
