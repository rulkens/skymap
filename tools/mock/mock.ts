/**
 * mock — keep one page open on `?mock=<name>` and re-shoot it on every save of
 * `src/dev/mocks/<name>.*` (`npm run mock -- <name> '<hash>' --url <dev server>`).
 *
 * stdout carries one absolute path per shot, everything else goes to stderr.
 * Page evaluations are string expressions: under tsx a function passed to the
 * page can carry esbuild's Node-only `__name` helper.
 */
import { watch } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { bootHookedPage } from '../utils/browser/bootHookedPage';
import { isNavigationInterruption } from '../utils/browser/isNavigationInterruption';
import { launchChromium } from '../utils/browser/launchChromium';
import { warnIfWrongCheckout } from '../utils/browser/warnIfWrongCheckout';
import { SHOT_JPEG_QUALITY } from '../utils/shot/SHOT_JPEG_QUALITY';
import { parseMockArgs } from './parseMockArgs';

const MOCKS_DIR = 'src/dev/mocks';
const HMR_WAIT_MS = 3_000;
const MOUNT_WAIT_MS = 15_000;
// An editor's save is often a burst of events (write, rename, chmod).
const DEBOUNCE_MS = 50;

const REVISION = '(window.__mockRevision ?? 0)';
const SETTLED = 'window.__skymap.settled()';
const TWO_FRAMES = 'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))';

async function main(): Promise<void> {
  const options = parseMockArgs(process.argv.slice(2));
  console.log = console.error;
  const outPath = resolve('data/shots', `mock-${options.name}${options.phone ? '-phone' : ''}.jpg`);
  await mkdir(resolve('data/shots'), { recursive: true });

  const browser = await launchChromium();
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => void browser.close().finally(() => process.exit(0)));
  }
  const context = await browser.newContext({
    viewport: { width: options.width, height: options.height },
    deviceScaleFactor: 2,
    hasTouch: options.phone,
    isMobile: options.phone,
  });
  const page = await context.newPage();
  page.on('pageerror', (err) => console.error(`mock: page error: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error(`mock: console.error: ${msg.text()}`);
  });
  // Only a full document load counts: the app's own hash writes are same-document.
  let loads = 0;
  page.on('load', () => loads++);

  let lastRevision = 0;
  let loadsAtLastShot = 0;
  const shoot = async (since: number): Promise<void> => {
    await page.evaluate(TWO_FRAMES);
    await page.screenshot({ path: outPath, type: 'jpeg', quality: SHOT_JPEG_QUALITY });
    lastRevision = (await page.evaluate(REVISION)) as number;
    loadsAtLastShot = loads;
    console.error(`mock: shot in ${Date.now() - since} ms`);
    process.stdout.write(`${outPath}\n`);
  };
  // After a boot or a full reload (Vite's answer to an edit Fast Refresh cannot take).
  const awaitMounted = async (): Promise<void> => {
    await page.waitForFunction(`window.__skymap !== undefined && ${REVISION} >= 1`, undefined, {
      timeout: MOUNT_WAIT_MS,
    });
    await page.evaluate('window.__skymap.ready');
    await page.evaluate(SETTLED);
  };

  const started = Date.now();
  await bootHookedPage(page, `${options.url}/?mock=${options.name}#${options.hash}`);
  await warnIfWrongCheckout(page);
  await awaitMounted();
  await shoot(started);

  // One task at a time, so a save landing mid-shot queues its own shot behind it.
  let queue = Promise.resolve();
  const enqueue = (task: () => Promise<void>): void => {
    queue = queue.then(task).catch((err: unknown) => {
      console.error(`mock: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`);
    });
  };

  const onSave = async (): Promise<void> => {
    const since = Date.now() - DEBOUNCE_MS;
    let moved = true;
    try {
      // Compared with the last shot, not with now: the update can beat this call to the page.
      await page.waitForFunction(`${REVISION} > ${lastRevision}`, undefined, {
        timeout: HMR_WAIT_MS,
      });
    } catch (err) {
      if (!isNavigationInterruption(err) && !/Timeout/.test(String(err))) throw err;
      moved = false;
    }
    if (loads !== loadsAtLastShot) {
      console.error('mock: the page reloaded; waiting for the scene to settle again');
      await awaitMounted();
    } else if (!moved) {
      console.error(`mock: no HMR update within ${HMR_WAIT_MS / 1000} s; shooting anyway`);
    }
    await shoot(since);
  };
  let debounce: NodeJS.Timeout | undefined;
  watch(resolve(MOCKS_DIR), (_event, file) => {
    if (file === null || !file.startsWith(`${options.name}.`)) return;
    clearTimeout(debounce);
    debounce = setTimeout(() => enqueue(onSave), DEBOUNCE_MS);
  });

  // The app answers `hashchange` (watchHashReadSaga) with a fly to the new view.
  createInterface({ input: process.stdin }).on('line', (line) => {
    const hash = line.trim().replace(/^#/, '');
    if (hash === '') return;
    enqueue(async () => {
      const since = Date.now();
      await page.evaluate(`location.hash = ${JSON.stringify(hash)}`);
      await page.evaluate(SETTLED);
      await shoot(since);
    });
  });
  console.error(`mock: watching ${MOCKS_DIR}/${options.name}.* — Ctrl-C to stop`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
