/**
 * Origins a phone can open this dev server on: each LAN IPv4 address, then localhost as the
 * fallback. A server not exposed with `--host` is bound to localhost alone, so it lists only that.
 */
import { networkInterfaces } from 'node:os';

export function listRemoteOrigins(port: number, exposed: boolean, https: boolean): string[] {
  const scheme = https ? 'https' : 'http';
  const lan = !exposed
    ? []
    : Object.values(networkInterfaces())
        .flatMap((addresses) => addresses ?? [])
        .filter((address) => address.family === 'IPv4' && !address.internal)
        .map((address) => `${scheme}://${address.address}:${port}`);
  return [...lan, `${scheme}://localhost:${port}`];
}
