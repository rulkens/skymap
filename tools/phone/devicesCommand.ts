import { execFileSync } from 'node:child_process';
import { forwardDevtools } from './forwardDevtools';
import { readLastTarget } from './readLastTarget';

const TIMEOUT_MS = 10_000;

/**
 * What is plugged in and what it exposes. The DevTools socket list names
 * every browser listening: Chrome and Brave both bind `chrome_devtools_remote`,
 * so with both running the forward reaches whichever started first.
 */
export async function devicesCommand(): Promise<void> {
  const adb = (...args: string[]): string =>
    execFileSync('adb', args, { encoding: 'utf8', timeout: TIMEOUT_MS });
  process.stdout.write(adb('devices', '-l'));
  const sockets = adb('shell', 'cat', '/proc/net/unix')
    .split('\n')
    .filter((line) => line.includes('devtools_remote'))
    .map((line) => line.trim().split(/\s+/).pop());
  console.log(
    `DevTools sockets: ${[...new Set(sockets)].join(' ') || 'none (is a browser open?)'}`,
  );
  const base = `http://localhost:${forwardDevtools()}`;
  const json = async (path: string): Promise<unknown> =>
    (await fetch(`${base}${path}`, { signal: AbortSignal.timeout(TIMEOUT_MS) })).json();
  const version = (await json('/json/version')) as Record<string, string>;
  console.log(`browser: ${version.Browser} (protocol ${version['Protocol-Version']})`);
  console.log(`user agent: ${version['User-Agent']}`);
  // Only the tool's own tab is named: the rest is the owner's browsing.
  const tabs = ((await json('/json/list')) as { id: string; type: string; url: string }[]).filter(
    (t) => t.type === 'page',
  );
  const last = tabs.find((t) => t.id === readLastTarget());
  console.log(
    `tabs: ${tabs.length}; last tool tab: ${last ? `${last.id} ${last.url}` : 'none open'}`,
  );
}
