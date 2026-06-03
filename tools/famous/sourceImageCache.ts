/**
 * sourceImageCache — persistent download cache for curator source images.
 *
 * The curator fetches a galaxy's source image and writes it into an EPHEMERAL
 * session tmpdir (see routes/fetch.ts).  Once that session is gone the original
 * is lost, so every resume, re-curation, and the thumb backfill re-downloads
 * the same bytes — slow, and fragile when an upstream URL has rotted.
 *
 * This cache keys downloaded bytes by sha256(url) under
 * `data/raw/famous/source-cache/` (gitignored — see rawDataRegistry
 * `famous.source-cache-dir`).  A miss downloads then persists; a hit reads from
 * disk and never touches the network.  Each entry is a pair:
 *
 *   <key>.bin   the raw downloaded bytes
 *   <key>.type  the media type string (so a hit reconstructs it exactly,
 *               rather than guessing from a URL extension that may be absent)
 *
 * The downloader is injected rather than imported so the cache is environment-
 * free and unit-testable: the curator wires in its UA-bearing fetch closure,
 * the backfill wires in a plain fetch, and tests wire in a counter.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** A downloaded image: raw bytes plus the server's media type. */
export type DownloadedImage = { bytes: Buffer; mediaType: string };

export type FetchWithCacheDeps = {
  /** Network fetch, called only on a cache miss. */
  download: (url: string) => Promise<DownloadedImage>;
  /** Cache root, e.g. rawDataPath('famous.source-cache-dir'). */
  cacheDir: string;
};

export type CachedFetchResult = DownloadedImage & { fromCache: boolean };

/** Stable sha256 hex of the URL — the cache entry's base filename. */
export function sourceCacheKey(url: string): string {
  return createHash('sha256').update(url).digest('hex');
}

/**
 * Return the image for `url`, serving it from `cacheDir` when present and
 * downloading + persisting it otherwise.  `fromCache` reports which path ran.
 */
export async function fetchWithCache(
  url: string,
  deps: FetchWithCacheDeps,
): Promise<CachedFetchResult> {
  const key = sourceCacheKey(url);
  const binPath = join(deps.cacheDir, `${key}.bin`);
  const typePath = join(deps.cacheDir, `${key}.type`);

  if (existsSync(binPath) && existsSync(typePath)) {
    return {
      bytes: readFileSync(binPath),
      mediaType: readFileSync(typePath, 'utf8'),
      fromCache: true,
    };
  }

  const downloaded = await deps.download(url);
  mkdirSync(deps.cacheDir, { recursive: true });
  writeFileSync(binPath, downloaded.bytes);
  writeFileSync(typePath, downloaded.mediaType);
  return { ...downloaded, fromCache: false };
}
