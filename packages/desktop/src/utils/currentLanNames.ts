import { hostname } from 'node:os';
import type { LanNames } from '../@types/LanNames.js';
import { listLanInterfaces } from './listLanInterfaces.js';

/** The names the server certificate must cover right now; macOS hostnames may already end in .local. */
export function currentLanNames(): LanNames {
  const host = hostname()
    .replace(/\.local$/i, '')
    .toLowerCase();
  return {
    hostnames: ['localhost', `${host}.local`],
    ips: listLanInterfaces().map((lan) => lan.address),
  };
}
