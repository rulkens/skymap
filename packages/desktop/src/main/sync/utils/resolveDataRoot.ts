import { join, resolve } from 'node:path';

/**
 * Where the mirror lives, and whether this run is dev (no sync, no prune). Unpackaged runs read the
 * repo's public/data so `npm run desktop` never starts a multi-gigabyte download (spec §6).
 */
export function resolveDataRoot(
  override: string | undefined,
  packaged: boolean,
  appPath: string,
  userData: string,
): { dataRoot: string; dev: boolean } {
  if (override !== undefined) return { dataRoot: override, dev: true };
  if (!packaged) return { dataRoot: resolve(appPath, '../../public/data'), dev: true };
  return { dataRoot: join(userData, 'data'), dev: false };
}
