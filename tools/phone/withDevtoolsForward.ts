import { execFileSync } from 'node:child_process';

const FORWARD_PORT = 9333;

/**
 * Run `fn` with a Mac port forwarded to the phone browser's DevTools socket,
 * removing the forward however `fn` ends: the adb server outlives the tool, so
 * a forward left behind listens for days. Chrome and Brave both listen on
 * `chrome_devtools_remote`. Only the DevTools socket rides USB: never
 * `adb reverse` the data, which once wedged the phone's adbd mid-download.
 */
export async function withDevtoolsForward<T>(fn: (port: number) => Promise<T>): Promise<T> {
  const adb = (...args: string[]): void => {
    execFileSync('adb', args, { stdio: ['ignore', 'ignore', 'pipe'], timeout: 10_000 });
  };
  adb('forward', `tcp:${FORWARD_PORT}`, 'localabstract:chrome_devtools_remote');
  try {
    return await fn(FORWARD_PORT);
  } finally {
    // An unplugged phone took the forward with it; a throw here would mask `fn`'s error.
    try {
      adb('forward', '--remove', `tcp:${FORWARD_PORT}`);
    } catch {}
  }
}
