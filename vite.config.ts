import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { staticBuildExtension } from 'wesl-plugin';
import viteWesl from 'wesl-plugin/vite';

import { DEV_PORTS } from './tools/utils/io/devPorts.ts';
import { distDir } from './tools/utils/io/distDir.ts';

// ── Opt-in LAN HTTPS for on-device (iPad/iPhone) testing ────────────────────
//
// WebGPU is gated to *secure contexts*. `localhost` qualifies, so the normal
// `npm run dev` loop needs no HTTPS. But a phone/tablet on the LAN reaches the
// dev server by IP (http://192.168.x.x:5173), which is NOT a secure context —
// `navigator.gpu` comes back undefined and the canvas stays blank. To debug
// the real renderer on a real iOS device we must serve the dev origin over
// HTTPS with a host binding.
//
// This is gated behind `SKYMAP_HTTPS=1` rather than always-on so it stays
// zero-cost for the common localhost loop and adds no requirement that the
// (gitignored) `.certs/` files exist. Generate them once with the
// already-present mkcert:
//
//   mkdir -p .certs && cd .certs && mkcert <your-lan-ip> localhost
//
// then run:  SKYMAP_HTTPS=1 npm run dev
//
// On the device, tap through Safari's untrusted-cert warning (the mkcert CA
// isn't trusted there). If WebGPU still reports unavailable, install the
// mkcert root CA on the device for a fully-trusted secure context.
function lanHttpsServer(): { host: boolean; https: { cert: Buffer; key: Buffer } } | undefined {
  if (process.env.SKYMAP_HTTPS !== '1') return undefined;

  const certDir = join(import.meta.dirname, '.certs');
  const files = existsSync(certDir) ? readdirSync(certDir) : [];
  const keyFile = files.find((f) => f.endsWith('-key.pem'));
  const certFile = files.find((f) => f.endsWith('.pem') && !f.endsWith('-key.pem'));
  if (!keyFile || !certFile) {
    throw new Error(
      'SKYMAP_HTTPS=1 but no cert pair found in .certs/. Run: ' +
        'mkdir -p .certs && cd .certs && mkcert <lan-ip> localhost',
    );
  }

  return {
    host: true, // bind 0.0.0.0 so the LAN can reach it
    https: {
      cert: readFileSync(join(certDir, certFile)),
      key: readFileSync(join(certDir, keyFile)),
    },
  };
}

// `wesl-plugin/vite` registers a Vite plugin that intercepts imports of
// `.wesl` (and `.wgsl`) files with recognised suffixes. We pass it just
// the `staticBuildExtension`, which handles the `?static` suffix — it
// runs the WESL linker at build time and returns a flat WGSL string,
// preserving the existing `import x from './foo.wesl?static'` shape and
// avoiding any runtime linker dependency. The alternative (`?link`)
// would defer linking to runtime, which we don't need yet and which
// would pull the `wesl` JS linker into the production bundle.
//
// `assetsInclude: ['**/*.wgsl']` is retained while a few `.wgsl` files
// remain unmigrated; once Task 2 finishes the bulk rename it can be
// dropped, but it's harmless until then.
export default defineConfig({
  plugins: [viteWesl({ extensions: [staticBuildExtension] }), react()],
  server: { port: DEV_PORTS.main, ...lanHttpsServer() },
  assetsInclude: ['**/*.wgsl'],
  build: { outDir: distDir },
});
