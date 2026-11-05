import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { build, preview } from 'vite';
import type { PhoneArgs } from './@types/PhoneArgs';
import { ensureLanCert } from './ensureLanCert';
import { lanIp } from './lanIp';
import { linkPublicEntries } from './linkPublicEntries';
import { PHONE_PATHS } from './PHONE_PATHS';

/**
 * Serve a production build to the phone over LAN HTTPS (WebGPU needs a secure
 * context, and a LAN IP is not one without TLS). The data origin is blanked
 * so the bundle fetches `/data/` from this server: the R2 host refuses a
 * LAN origin under CORS. Without `--build` it only says how to reach dev.
 */
export async function serveCommand(args: PhoneArgs): Promise<void> {
  const ip = lanIp();
  const cert = ensureLanCert(PHONE_PATHS.certs, ip);
  if (!args.build) {
    console.log('dev server for the phone:  SKYMAP_HTTPS=1 npm run dev');
    console.log(`then pass its Network: line, e.g.  --url https://${ip}:5173`);
    console.log('or serve a production build:  npm run phone -- serve --build');
    return;
  }
  // Vite lets an env var already set win over .env.production.
  process.env.VITE_DATA_BASE_URL = '/';
  process.env.VITE_COUNTERSCALE_URL = '';
  const configFile = resolve('vite.config.ts');
  const outDir = resolve(PHONE_PATHS.dist);
  await build({ configFile, build: { outDir, emptyOutDir: true, copyPublicDir: false } });
  const linked = linkPublicEntries(resolve('public'), outDir);
  console.log(`linked public/ entries into ${outDir}: ${linked.join(' ')}`);
  if (!existsSync(resolve('public/data'))) {
    console.error(
      'phone: public/data is missing in this checkout; every data fetch gets index.html (see /link-data)',
    );
  }
  const server = await preview({
    configFile,
    build: { outDir },
    preview: { host: true, port: args.port, strictPort: true, https: cert },
  });
  server.printUrls();
  console.log(`phone origin: https://${ip}:${args.port}  (Ctrl-C stops the server)`);
}
