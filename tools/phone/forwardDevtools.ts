import { execFileSync } from 'node:child_process';

const FORWARD_PORT = 9333;

/**
 * Forward a Mac port to the phone browser's DevTools socket and return the
 * port. Chrome and Brave both listen on `chrome_devtools_remote`. Only the
 * DevTools socket rides USB: never `adb reverse` the data, which once wedged
 * the phone's adbd mid-download.
 */
export function forwardDevtools(): number {
  execFileSync('adb', ['forward', `tcp:${FORWARD_PORT}`, 'localabstract:chrome_devtools_remote'], {
    stdio: ['ignore', 'ignore', 'pipe'],
    timeout: 10_000,
  });
  return FORWARD_PORT;
}
