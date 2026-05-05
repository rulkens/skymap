import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Diagnostic: emit the build-time value of VITE_DATA_BASE_URL so we can
// confirm Cloudflare's GitHub-integrated build is actually exposing the
// dashboard env var to `npm run build`.  This reads `process.env` directly
// (NOT Vite's resolved `import.meta.env`) so we see only what the shell
// environment provides — `.env*` files don't influence this line.  If the
// log shows `undefined` in the Cloudflare build log, the var is set in the
// wrong panel (runtime "Variables and Secrets" instead of build env).
// Remove once we've verified end-to-end.
console.log(
  '[skymap build diag] VITE_DATA_BASE_URL =',
  JSON.stringify(process.env.VITE_DATA_BASE_URL ?? null),
);

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  assetsInclude: ['**/*.wgsl'],
});
