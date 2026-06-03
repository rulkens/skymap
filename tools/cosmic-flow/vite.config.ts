/**
 * Cosmic Flow — Vite dev server config.
 *
 * Cosmic Flow is a CF4++ peculiar-velocity flow visualiser. Like the
 * famous-curator, it is a sibling dev tool rather than part of the skymap
 * runtime bundle, so it gets its own self-contained Vite app:
 *
 *  - Its own port (5300), deliberately clear of the main app's 5173 and the
 *    curator's 5200, so all three can run side-by-side during development.
 *  - Its own `root` — this `tools/cosmic-flow/` directory — so Vite resolves
 *    `index.html` from here rather than the repo root.
 *  - Its own `publicDir` pointing at `tools/cosmic-flow/public/`, where the
 *    one-off `convertCf4ppVfield.py` extractor drops `cf4pp_vfield.bin` +
 *    `.json`. Unlike the curator (which sets `publicDir: false` to avoid
 *    serving the runtime atlas), this tool DOES need a public dir: it reads
 *    those two static field assets and nothing else. There is no API plugin —
 *    Cosmic Flow is purely a static-asset reader, with no server-side state.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(__dirname),
  publicDir: resolve(__dirname, 'public'),
  server: { port: 5300 },
  plugins: [react()],
});
