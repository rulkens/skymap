/**
 * sweepSfMapActivityHistogram — does activity clamp on arm crests while
 * the dust CDF's mass concentrates there? Measures it, rather than inferring
 * it from the update rule.
 *
 *   npx tsx tools/galaxy-renderer/sweepSfMapActivityHistogram.ts [--headed]
 *     [--spread N] [--gasRegen N] [--refractorySteps N] [--dustFloorFraction N] [--steps N]
 *
 * The five override flags replace one field of `DEFAULT_GALAXY_SF_MAP_AUTOMATON_PARAMS`
 * each; omitted ones keep the shipped default, so a flagless run is
 * byte-identical to before these flags existed.
 *
 * Same shape as sweepSfMapPercolation.ts: self-hosted Vite dev server (this
 * tool's own, for the WESL `?static` link) + headless Chromium, chromium
 * channel first. The page half is
 * `src/engine/sfMap/sfMapActivityHistogramHarness.ts`, which formats and
 * returns the whole report as one string — this driver just prints it.
 */
import { chromium, type Browser } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';

import type { GalaxySfMapAutomatonParams } from '../../src/@types/galaxy/GalaxySfMapAutomatonParams';

/** `GalaxySfMapAutomatonParams`'s own fields are readonly (the params contract); this driver's CLI parse needs to build one up field-by-field. */
type MutableSfMapOverrides = {
  -readonly [K in keyof GalaxySfMapAutomatonParams]?: GalaxySfMapAutomatonParams[K];
};

type Options = { headed: boolean; overrides: MutableSfMapOverrides };

/** Same flag idiom as sweepSfMapPercolation.ts's parseArgs: `--flag value` pairs, one throw for anything unrecognised. */
function parseArgs(argv: readonly string[]): Options {
  const options: Options = { headed: false, overrides: {} };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--headed') options.headed = true;
    else if (arg === '--spread') options.overrides.spread = Number(argv[++i]);
    else if (arg === '--gasRegen') options.overrides.gasRegen = Number(argv[++i]);
    else if (arg === '--refractorySteps') options.overrides.refractorySteps = Number(argv[++i]);
    else if (arg === '--dustFloorFraction') options.overrides.dustFloorFraction = Number(argv[++i]);
    else if (arg === '--steps') options.overrides.steps = Number(argv[++i]);
    else
      throw new Error(
        `unknown flag '${arg}' (known: --spread, --gasRegen, --refractorySteps, --dustFloorFraction, --steps, --headed)`,
      );
  }
  return options;
}

function findFreePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const socket = createNetServer();
    socket.on('error', reject);
    socket.listen(0, '127.0.0.1', () => {
      const address = socket.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      socket.close(() => resolvePort(port));
    });
  });
}

async function startDevServer(): Promise<{ server: ViteDevServer; url: string }> {
  const configFile = fileURLToPath(new URL('./vite.config.ts', import.meta.url));
  const server = await createServer({
    configFile,
    logLevel: 'warn',
    server: { port: await findFreePort(), strictPort: false },
  });
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (url === undefined) throw new Error('vite dev server started but resolved no local URL');
  return { server, url: url.replace(/\/$/, '') };
}

async function launchChromium(headed: boolean): Promise<Browser> {
  try {
    return await chromium.launch({ channel: 'chromium', headless: !headed });
  } catch {
    return chromium.launch({
      headless: !headed,
      args: ['--enable-unsafe-webgpu', '--use-angle=metal'],
    });
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  const hosted = await startDevServer();
  const server: ViteDevServer = hosted.server;
  const browser = await launchChromium(options.headed);

  try {
    const context = await browser.newContext({ viewport: { width: 400, height: 300 } });
    const page = await context.newPage();
    page.setDefaultTimeout(600_000);
    page.on('pageerror', (err) => console.error(`page error: ${err.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') console.error(`console: ${message.text()}`);
    });
    await page.goto(`${hosted.url}/sfMapActivityHistogram.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => '__sfMapActivityHistogram' in globalThis);

    // undefined (not {}) when flagless, so a default run hits the harness's
    // own `overrides === undefined` fast path and stays object-identical to
    // pre-flag behaviour, not just numerically equal.
    const overrides = Object.keys(options.overrides).length > 0 ? options.overrides : undefined;
    // Anonymous on purpose: sweepSfMapPercolation.ts hit the `keepNames`/
    // `__name` wall with a named function here.
    const report = (await page.evaluate(
      (o) =>
        (
          globalThis as unknown as {
            __sfMapActivityHistogram: (o?: Partial<GalaxySfMapAutomatonParams>) => Promise<string>;
          }
        ).__sfMapActivityHistogram(o),
      overrides,
    )) as string;
    console.log(`\n${report}`);

    await context.close();
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
