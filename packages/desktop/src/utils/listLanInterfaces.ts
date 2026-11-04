import { networkInterfaces } from 'node:os';
import type { LanInterface } from '../@types/LanInterface.js';

/** Every non-internal IPv4 address with its interface name, in the OS's order. */
export function listLanInterfaces(): LanInterface[] {
  return Object.entries(networkInterfaces()).flatMap(([name, addresses]) =>
    (addresses ?? [])
      .filter((a) => a.family === 'IPv4' && !a.internal)
      .map((a) => ({ name, address: a.address })),
  );
}
