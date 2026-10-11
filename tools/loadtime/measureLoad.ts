/**
 * measureLoad — cold-load milestones of the production build under a throttled
 * network and CPU (`npm run loadtime`). One fresh browser context per profile,
 * so nothing is cached; see README.md for the milestones and flags.
 */
import { mkdirSync } from 'node:fs';
import { parseArgs } from 'node:util';
import type { Browser } from '@playwright/test';
import { launchChromium } from '../utils/browser/launchChromium';
import { ensureDataSymlink } from '../utils/serve/ensureDataSymlink';
import { ensureServeBuild } from '../utils/serve/ensureServeBuild';
import { readCertPair } from '../utils/serve/readCertPair';
import { serveGzipped } from '../utils/serve/serveGzipped';
import type { LoadMilestones } from './@types/LoadMilestones';
import type { MarkedWindow } from './@types/MarkedWindow';
import type { NetworkProfile } from './@types/NetworkProfile';
import { NETWORK_PROFILES } from './networkProfiles';

const BUILD_DIR = 'tools/loadtime/.build';
// Fixed, so the origin (and its localStorage) is the same on every `--serve`.
const SERVE_PORT = 4520;
const MOBILE_VIEWPORT = { width: 390, height: 844 };
const MOBILE_DPR = 3;
const FILMSTRIP_SECONDS: readonly number[] = [1, 2, 4, 8, 15, 30];
const MILESTONES = ['fcp', 'mounted', 'firstFrame', 'ctaReady', 'loaded'] as const;
const KBPS_TO_BYTES_PER_SECOND = 1000 / 8;

// Runs in the page before any app script. A string, because tsx wraps a nested
// named function in a `__name` helper that exists only in Node. It wraps
// `getCurrentTexture` rather than reading a mark back so that a build without
// marks measures the same way.
const INSTALL_MARKS = `
  const marks = (window.__loadMarks = {});
  const mark = (key) => { marks[key] ??= performance.now(); };
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.name === 'first-contentful-paint') marks.fcp = entry.startTime;
    }
  }).observe({ type: 'paint', buffered: true });
  new MutationObserver(() => {
    if (document.getElementById('root')?.firstElementChild) mark('mounted');
    if (document.querySelector('[data-splash-primary]:not([disabled])')) mark('ctaReady');
  }).observe(document, {
    subtree: true, childList: true, attributes: true, attributeFilter: ['disabled'],
  });
  if (typeof GPUCanvasContext !== 'undefined') {
    const original = GPUCanvasContext.prototype.getCurrentTexture;
    GPUCanvasContext.prototype.getCurrentTexture = function () {
      mark('firstFrame');
      return original.call(this);
    };
  }
`;

async function measure(
  browser: Browser,
  url: string,
  profile: NetworkProfile,
  timeoutMs: number,
  filmstripDir: string | undefined,
): Promise<LoadMilestones> {
  const context = await browser.newContext({
    viewport: MOBILE_VIEWPORT,
    deviceScaleFactor: MOBILE_DPR,
    // The mkcert CA is not in headless Chromium's trust store.
    ignoreHTTPSErrors: true,
    isMobile: true,
    hasTouch: true,
  });
  try {
    const page = await context.newPage();
    await page.addInitScript(INSTALL_MARKS);
    const cdp = await context.newCDPSession(page);
    if (profile.downKbps > 0) {
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: profile.latencyMs,
        downloadThroughput: profile.downKbps * KBPS_TO_BYTES_PER_SECOND,
        uploadThroughput: profile.upKbps * KBPS_TO_BYTES_PER_SECOND,
      });
    }
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpuRate });

    const start = Date.now();
    const shots = (filmstripDir === undefined ? [] : FILMSTRIP_SECONDS).map(async (seconds) => {
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
      // A closed context (the run finished first) is the expected way out.
      await page
        .screenshot({
          path: `${filmstripDir}/${String(seconds).padStart(2, '0')}s.jpg`,
          quality: 80,
        })
        .catch(() => {});
    });
    await page.goto(url, { waitUntil: 'commit', timeout: timeoutMs });
    const loaded = page.evaluate(async () => {
      const w = window as unknown as MarkedWindow;
      while (w.__skymap === undefined) await new Promise((resolve) => setTimeout(resolve, 100));
      await w.__skymap.ready;
      w.__loadMarks.loaded = performance.now();
    });
    const remaining = Math.max(0, timeoutMs - (Date.now() - start));
    await Promise.race([loaded, new Promise((resolve) => setTimeout(resolve, remaining))]);
    await Promise.all(shots);
    return await page.evaluate(() => (window as unknown as MarkedWindow).__loadMarks);
  } finally {
    await context.close();
  }
}

function seconds(ms: number | undefined, timeoutMs: number): string {
  return ms === undefined ? `>${timeoutMs / 1000}` : (ms / 1000).toFixed(1);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      profile: { type: 'string', multiple: true },
      link: { type: 'string', default: '' },
      timeout: { type: 'string', default: '90' },
      filmstrip: { type: 'string' },
      rebuild: { type: 'boolean', default: false },
      serve: { type: 'boolean', default: false },
    },
  });
  const names = values.profile ?? ['3g', 'slow-4g', 'fast-4g'];
  const timeoutMs = Number(values.timeout) * 1000;
  const log = console.log;
  console.log = console.error;
  await ensureServeBuild(BUILD_DIR, values.rebuild);
  ensureDataSymlink(BUILD_DIR);
  const certs = readCertPair('.certs');
  if (certs === undefined) {
    console.error(
      '  no cert pair in .certs/, so serving HTTP/1.1; for HTTP/2 run: ' +
        'mkdir -p .certs && cd .certs && mkcert localhost',
    );
  }
  const server = await serveGzipped(BUILD_DIR, certs, values.serve ? SERVE_PORT : 0);
  if (values.serve) {
    log(`serving the production build at ${server.url} (Ctrl-C to stop)`);
    await new Promise(() => {});
  }
  const browser = await launchChromium();
  try {
    log(`| profile | ${MILESTONES.join(' | ')} |`);
    log(`|---|${MILESTONES.map(() => '---:').join('|')}|`);
    for (const name of names) {
      const profile = NETWORK_PROFILES[name as keyof typeof NETWORK_PROFILES];
      if (profile === undefined) {
        throw new Error(`unknown profile '${name}' (${Object.keys(NETWORK_PROFILES).join(', ')})`);
      }
      const dir = values.filmstrip === undefined ? undefined : `${values.filmstrip}/${name}`;
      if (dir !== undefined) mkdirSync(dir, { recursive: true });
      const marks = await measure(browser, `${server.url}/${values.link}`, profile, timeoutMs, dir);
      log(`| ${name} | ${MILESTONES.map((m) => seconds(marks[m], timeoutMs)).join(' | ')} |`);
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
