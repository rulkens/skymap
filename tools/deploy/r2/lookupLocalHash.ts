import type { LocalHashCache } from '../@types/LocalHashCache';
import { localHashCacheKey } from './localHashCacheKey';

/**
 * The cached MD5, or null when the file changed since it was hashed. Size and
 * mtime are the whole test: a bake rewrites its files, which moves the mtime.
 */
export function lookupLocalHash(
  cache: LocalHashCache,
  localPath: string,
  gzipOnWire: boolean,
  stat: { readonly size: number; readonly mtimeMs: number },
): string | null {
  const entry = cache[localHashCacheKey(localPath, gzipOnWire)];
  if (entry === undefined || entry.size !== stat.size || entry.mtimeMs !== stat.mtimeMs) {
    return null;
  }
  return entry.md5;
}
