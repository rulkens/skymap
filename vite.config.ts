import { join } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { weslStaticPlugin } from './tools/utils/vite/weslStaticPlugin.ts';

import { DEV_PORTS } from './tools/utils/io/devPorts.ts';
import { distDir } from './tools/utils/io/distDir.ts';
import { readCertPair } from './tools/utils/serve/readCertPair.ts';
import { inlineEntryCssPlugin } from './tools/utils/vite/inlineEntryCssPlugin.ts';
import { remoteRelayPlugin } from './tools/utils/vite/remoteRelayPlugin.ts';
import { satelliteJsDistAlias } from './tools/utils/vite/satelliteJsDistAlias.ts';
import { minifyStaticWgslPlugin } from './tools/utils/wgsl/minifyStaticWgslPlugin.ts';

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

  const certs = readCertPair(join(import.meta.dirname, '.certs'));
  if (certs === undefined) {
    throw new Error(
      'SKYMAP_HTTPS=1 but no cert pair found in .certs/. Run: ' +
        'mkdir -p .certs && cd .certs && mkcert <lan-ip> localhost',
    );
  }

  return {
    host: true, // bind 0.0.0.0 so the LAN can reach it
    https: certs,
  };
}

// `weslStaticPlugin` resolves `import x from './foo.wesl?static'`: it runs
// the WESL linker at build time and returns a flat WGSL string, so there
// is no runtime linker dependency. Linking at runtime would buy
// conditional compilation, which we don't need, at the cost of shipping
// the `wesl` JS linker in the production bundle.
//
// `assetsInclude: ['**/*.wgsl']` is retained while a few `.wgsl` files
// remain unmigrated; once Task 2 finishes the bulk rename it can be
// dropped, but it's harmless until then.
export default defineConfig(({ command }) => ({
  plugins: [
    weslStaticPlugin(),
    minifyStaticWgslPlugin(),
    react(),
    inlineEntryCssPlugin(),
    remoteRelayPlugin(),
  ],
  resolve: { alias: satelliteJsDistAlias },
  server: { port: DEV_PORTS.main, ...lanHttpsServer() },
  // Dev only: a built bundle must not carry this machine's absolute path.
  define: {
    __SKYMAP_PROJECT_ROOT__: JSON.stringify(command === 'serve' ? import.meta.dirname : ''),
  },
  assetsInclude: ['**/*.wgsl'],
  build: {
    outDir: distDir,
    license: { fileName: 'third-party-licenses.md' },
    rollupOptions: {
      input: {
        main: join(import.meta.dirname, 'index.html'),
        remote: join(import.meta.dirname, 'remote.html'),
      },
    },
  },
}));
