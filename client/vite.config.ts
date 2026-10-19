import { fileURLToPath } from 'node:url';
import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [preact()],
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      // No changeOrigin here, on purpose. The server accepts an upgrade only when the Origin host
      // matches the Host header. The browser sends Origin: localhost:5173 and Host: localhost:5173,
      // so leaving Host alone keeps them equal. changeOrigin would rewrite Host to :3000 and the
      // upgrade would be refused with 403.
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
    },
  },
});
