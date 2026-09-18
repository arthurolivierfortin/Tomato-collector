import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

/**
 * Isolation cross-origin (issue #36) : sans elle, `SharedArrayBuffer` est indisponible et
 * onnxruntime-web retombe sur un seul thread wasm — l'inférence du détecteur passait de ~0,3 s à
 * ~1,3 s et le réveil prenait plus de 10 s. Tout ce que la page charge est servi par Vite (même
 * origine) ; le serveur MCP, qui sert `/episodes` en cross-origin, répond avec
 * `Cross-Origin-Resource-Policy: cross-origin`.
 */
const ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, strictPort: true, headers: ISOLATION_HEADERS },
  preview: { headers: ISOLATION_HEADERS },
});
