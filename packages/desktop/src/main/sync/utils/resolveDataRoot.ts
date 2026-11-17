import { join, resolve } from 'node:path';
import type { DataRoot } from '../@types/DataRoot';

/**
 * Where the mirror lives, and whether this run is dev. Unpackaged runs read the repo's public/data
 * so `npm run desktop` never starts a multi-gigabyte download (spec §6).
 */
export function resolveDataRoot(
  override: string | undefined,
  packaged: boolean,
  appPath: string,
  userData: string,
): DataRoot {
  if (override !== undefined) return { dataRoot: override, dev: true };
  if (!packaged) return { dataRoot: resolve(appPath, '../../public/data'), dev: true };
  return { dataRoot: join(userData, 'data'), dev: false };
}
