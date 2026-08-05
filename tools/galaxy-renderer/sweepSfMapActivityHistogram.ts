/**
 * sweepSfMapActivityHistogram — does oldActivity clamp on arm crests while
 * the dust CDF's mass concentrates there? Measures it, rather than inferring
 * it from the update rule.
 *
 *   npx tsx tools/galaxy-renderer/sweepSfMapActivityHistogram.ts [--headed]
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
  const headed = process.argv.includes('--headed');

  const hosted = await startDevServer();
  const server: ViteDevServer = hosted.server;
  const browser = await launchChromium(headed);

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

    // Anonymous on purpose: sweepSfMapPercolation.ts hit the `keepNames`/
    // `__name` wall with a named function here.
    const report = (await page.evaluate(() =>
      (
        globalThis as unknown as { __sfMapActivityHistogram: () => Promise<string> }
      ).__sfMapActivityHistogram(),
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
