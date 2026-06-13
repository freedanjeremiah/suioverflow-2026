import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Mysten SDKs expect Buffer/global/process in the browser. We shim those
// minimally in src/polyfills.ts (imported first in main.tsx) instead of the
// heavyweight node-polyfills plugin, which mis-resolves unenv against React.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { buffer: 'buffer/' } },
  define: { global: 'globalThis' },
  optimizeDeps: {
    include: ['buffer'],
    esbuildOptions: { define: { global: 'globalThis' } },
  },
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: true } },
  },
  preview: {
    port: 4173,
    proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: true } },
  },
});
