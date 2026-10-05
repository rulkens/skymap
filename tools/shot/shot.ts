/**
 * shot — PNG of each deep link as the app shows it (`npm run shot -- <link>...`).
 *
 * stdout carries exactly one absolute path per shot; everything else goes to
 * stderr, so the output can be piped. The build helpers print progress with
 * console.log, so it is pointed at stderr for the whole run. Exits 1 if any
 * shot timed out, errored or produced no file.
 */
import type { Browser } from '@playwright/test';
import { launchChromium } from '../utils/browser/launchChromium';
import { ensureDataSymlink } from '../utils/serve/ensureDataSymlink';
import { ensureServeBuild } from '../utils/serve/ensureServeBuild';
import { spawnDevServer } from '../utils/serve/spawnDevServer';
import { spawnPreviewServer } from '../utils/serve/spawnPreviewServer';
import { shootLink } from '../utils/shot/shootLink';
import { shotOutName } from '../utils/shot/shotOutName';
import type { PreviewHandle } from '../@types/serve/PreviewHandle';
import { parseShotArgs } from './parseShotArgs';

// Its own directory, so a concurrent `record-tour --serve` build is never clobbered.
const SHOT_BUILD_DIR = 'tools/shot/.build';
const SHOT_PORT = 4518;

async function main(): Promise<number> {
  const options = parseShotArgs(process.argv.slice(2));
  const stdoutLine = (line: string): void => void process.stdout.write(`${line}\n`);
  console.log = console.error;

  let server: PreviewHandle | undefined;
  let browser: Browser | undefined;
  let failed = false;
  try {
    let base = options.url;
    if (base === undefined) {
      if (options.build) {
        await ensureServeBuild(SHOT_BUILD_DIR, true);
        ensureDataSymlink(SHOT_BUILD_DIR);
        server = await spawnPreviewServer(SHOT_BUILD_DIR, SHOT_PORT);
      } else {
        server = await spawnDevServer();
      }
      // A killed run skips `finally`, which would orphan the server.
      const spawned = server;
      for (const signal of ['SIGINT', 'SIGTERM'] as const) {
        process.once(signal, () => {
          spawned.proc.kill();
          process.exit(1);
        });
      }
      base = server.url;
      console.error(`shot: serving at ${base}`);
    }
    browser = await launchChromium();
    const taken = new Set<string>();
    for (const link of options.links) {
      const outPath =
        options.out ?? shotOutName({ link, format: options.format, now: new Date(), taken });
      taken.add(outPath);
      const outcome = await shootLink(browser, base, link, {
        ...options,
        outPath,
      });
      const label = `#${link.hash}`;
      if (outcome.path !== null) stdoutLine(outcome.path);
      if (outcome.timedOut) {
        console.error(
          `shot: ${label} did not settle within ${options.timeoutMs / 1000} s — shot what was on screen`,
        );
      }
      if (outcome.error !== null) console.error(`shot: ${label} failed: ${outcome.error}`);
      for (const e of outcome.pageErrors) console.error(`shot: ${label} page ${e}`);
      if (outcome.timedOut || outcome.error !== null || outcome.path === null) failed = true;
    }
  } finally {
    // Kill first: a throwing browser.close() must not orphan the server.
    server?.proc.kill();
    await browser?.close();
  }
  return failed ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
