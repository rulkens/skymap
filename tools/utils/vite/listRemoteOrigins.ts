/** Origins a phone can open this dev server on: each LAN IPv4 address, then localhost as the fallback. */
import { networkInterfaces } from 'node:os';

export function listRemoteOrigins(port: number): string[] {
  const lan = Object.values(networkInterfaces())
    .flatMap((addresses) => addresses ?? [])
    .filter((address) => address.family === 'IPv4' && !address.internal)
    .map((address) => `http://${address.address}:${port}`);
  return [...lan, `http://localhost:${port}`];
}
