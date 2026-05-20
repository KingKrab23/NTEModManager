import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  publicDir: false,
  build: {
    emptyOutDir: false,
    outDir: 'dist/renderer',
    sourcemap: true,
    rollupOptions: {
      input: 'index.html',
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
});
