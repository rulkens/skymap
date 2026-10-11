/**
 * External link check over the built website: every `http(s)` address in
 * `dist/<base>/**.html` is asked for once, and each one that does not answer
 * is listed with its status, the pages it stands on and the data row that
 * holds it. Needs the network, so CI does not run it; run it by hand after
 * `npm run site:build` and read a failure twice before believing it. Exits 1
 * on an address that is gone; one that only refuses a robot (403, 405, 429)
 * is listed for a person to open.
 *
 *   npm run site:external [-- --only <host>]
 *
 * Many publishers refuse a script and serve a browser, so an address that
 * fails a plain request is opened in Chromium before it is reported. A DOI is
 * good when doi.org redirects it: where it lands is the publisher's wall.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix, relative, resolve, sep } from 'node:path';

import { launchChromium } from '../utils/browser/launchChromium';
import { distDir } from '../utils/io/distDir';
import { toolPages } from '../utils/io/toolPages';
import { extractLinks } from './utils/extractLinks';
import { rowOfAddress } from './utils/rowOfAddress';

const TIMEOUT_MS = 30_000;
// Two at a time to one host is what a reader's browser would do; more gets a 429 from the archives.
const PER_HOST = 2;
const AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const siteDir = resolve(distDir, toolPages.website);
const root = resolve(import.meta.dirname, '../..');
if (!existsSync(siteDir)) {
  console.error(`No build at ${siteDir}. Run "npm run site:build" first.`);
  process.exit(1);
}
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : undefined;

const htmlFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? htmlFiles(path) : path.endsWith('.html') ? [path] : [];
  });

// An address without its fragment is one document, however many views or sections of it the pages link to.
const pagesOf = new Map<string, Set<string>>();
for (const file of htmlFiles(siteDir)) {
  const page = `/${relative(siteDir, file)
    .split(sep)
    .join(posix.sep)
    .replace(/index\.html$/, '')}`;
  for (const href of extractLinks(readFileSync(file, 'utf8'))) {
    if (!/^https?:\/\//.test(href)) continue;
    const address = href.replace(/&amp;/g, '&').split('#')[0]!;
    if (only && new URL(address).hostname !== only) continue;
    if (!pagesOf.has(address)) pagesOf.set(address, new Set());
    pagesOf.get(address)!.add(page);
  }
}

async function ask(address: string): Promise<string | null> {
  const doi = new URL(address).hostname === 'doi.org';
  try {
    const response = await fetch(address, {
      headers: { 'user-agent': AGENT, accept: 'text/html,*/*' },
      redirect: doi ? 'manual' : 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    await response.body?.cancel();
    if (doi && response.status >= 300 && response.status < 400) return null;
    return response.ok ? null : String(response.status);
  } catch (error) {
    const cause =
      error instanceof Error ? (error.cause as { code?: string } | undefined) : undefined;
    return cause?.code ?? (error instanceof Error ? error.name : 'error');
  }
}

const byHost = new Map<string, string[]>();
for (const address of pagesOf.keys()) {
  const host = new URL(address).hostname;
  byHost.set(host, [...(byHost.get(host) ?? []), address]);
}

const refused = new Map<string, string>();
await Promise.all(
  [...byHost.values()].map(async (addresses) => {
    const queue = [...addresses];
    const worker = async () => {
      for (let address = queue.shift(); address; address = queue.shift()) {
        const reason = await ask(address);
        if (reason) refused.set(address, reason);
      }
    };
    await Promise.all(Array.from({ length: PER_HOST }, worker));
  }),
);

const WALLS = new Set(['403', '405', '429']);
const failures: string[] = [];
const walled: string[] = [];
if (refused.size > 0) {
  const browser = await launchChromium();
  const context = await browser.newContext({ userAgent: AGENT });
  try {
    for (const [address, reason] of refused) {
      const page = await context.newPage();
      let seen = reason;
      try {
        const response = await page.goto(address, {
          waitUntil: 'domcontentloaded',
          timeout: TIMEOUT_MS,
        });
        seen = response && response.status() < 400 ? '' : String(response?.status() ?? reason);
      } catch (error) {
        // A file the browser downloads instead of showing is there.
        seen =
          error instanceof Error && error.message.includes('Download is starting') ? '' : reason;
      }
      await page.close();
      if (seen) {
        (WALLS.has(seen) ? walled : failures).push(
          `${seen}  ${address}\n      on ${[...pagesOf.get(address)!].join(' ')}\n      row ${rowOfAddress(root, address) ?? 'not found in the data files'}`,
        );
      }
    }
  } finally {
    await browser.close();
  }
}

if (walled.length > 0) {
  console.log(
    `${walled.length} refuse a robot, for a person to open:\n${walled.map((f) => `  ${f}`).join('\n')}`,
  );
}
if (failures.length > 0) {
  console.error(
    `${failures.length} of ${pagesOf.size} external addresses did not answer:\n${failures.map((f) => `  ${f}`).join('\n')}`,
  );
  process.exit(1);
}
console.log(`ok  ${pagesOf.size} external addresses, none gone (${walled.length} refuse a robot)`);
