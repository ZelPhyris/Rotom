import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, the React app runs on :5173 and the API on :3000. Proxying /api keeps
// them same-origin, so session cookies are first-party (no CORS, no SameSite
// headaches). In production nginx serves the built site and proxies /api too.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3100',
        changeOrigin: true,
      },
    },
  },
});
