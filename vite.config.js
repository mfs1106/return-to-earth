import { defineConfig } from 'vite';

// The deploy platform injects a PORT env var (default 3000) and expects the
// service to listen on it and bind 0.0.0.0. Vite does NOT read PORT on its own,
// so we map it here. Locally (no PORT set) it falls back to 5173/4173.
const PORT = process.env.PORT ? Number(process.env.PORT) : 5173;

export default defineConfig({
  base: './',
  server: {
    host: '0.0.0.0',
    port: PORT,
    strictPort: true,
    // Required for deployment behind a reverse-proxy domain.
    // Without this, Vite rejects proxied requests with
    // "Blocked request. This host is not allowed."
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: PORT,
    strictPort: true,
    allowedHosts: true,
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
});
