// The sailing page stays at the repo root and is served by server.mjs (`npm run ocean`).
// This config is the new client. Its root is src/ so the two index.html files can coexist
// until the port matches the ocean goldens.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(here, 'src'),
  publicDir: false,
  server: { port: 5173, strictPort: true },
  build: {
    outDir: path.join(here, 'dist'),
    emptyOutDir: true,
  },
});
