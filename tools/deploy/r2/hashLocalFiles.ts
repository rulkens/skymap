import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { LocalHashCache } from '../@types/LocalHashCache';
import type { R2SyncGroup } from '../@types/R2SyncGroup';
import { localHashCacheKey } from './localHashCacheKey';
import { localUploadHash } from './localUploadHash';
import { lookupLocalHash } from './lookupLocalHash';

/**
 * In `node_modules/.cache`: per checkout, already gitignored, outside
 * `public/data` (whose drift guard would refuse it), and kept across reboots
 * that clear the OS temp dir. Losing it only costs one full re-hash.
 */
const CACHE_PATH = 'node_modules/.cache/skymap-sync/hashes.json';

/**
 * `localUploadHash` for each file of `groups` whose key passes `include`, keyed
 * by R2 key. Hits come from the cache; misses are hashed and written back once.
 */
export function hashLocalFiles(
  groups: readonly R2SyncGroup[],
  include: (r2Key: string) => boolean,
): ReadonlyMap<string, string> {
  const cache = readCache();
  const fresh: Record<string, LocalHashCache[string]> = {};
  const hashes = new Map<string, string>();
  const checked = groups.flatMap((group) =>
    group.files
      .filter((file) => include(file.r2Key))
      .map((file) => {
        const { size, mtimeMs } = statSync(file.localPath);
        const md5 = lookupLocalHash(cache, file.localPath, group.gzipOnWire, { size, mtimeMs });
        return { file, gzipOnWire: group.gzipOnWire, size, mtimeMs, md5 };
      }),
  );
  const hits = checked.filter((c) => c.md5 !== null).length;
  console.error(`▶ hashing ${checked.length} local file(s) (${hits} cached)`);
  for (const { file, gzipOnWire, size, mtimeMs, md5: cached } of checked) {
    let md5 = cached;
    if (md5 === null) {
      console.error(
        `# ${file.localPath} (${(size / 1e6).toFixed(1)} MB${gzipOnWire ? ', gzip' : ''})`,
      );
      md5 = localUploadHash(file, gzipOnWire);
      fresh[localHashCacheKey(file.localPath, gzipOnWire)] = { size, mtimeMs, md5 };
    }
    hashes.set(file.r2Key, md5);
  }
  if (Object.keys(fresh).length > 0) {
    mkdirSync(dirname(CACHE_PATH), { recursive: true });
    writeFileSync(CACHE_PATH, JSON.stringify({ ...cache, ...fresh }));
  }
  return hashes;
}

function readCache(): LocalHashCache {
  try {
    return JSON.parse(readFileSync(CACHE_PATH, 'utf8')) as LocalHashCache;
  } catch {
    return {};
  }
}
