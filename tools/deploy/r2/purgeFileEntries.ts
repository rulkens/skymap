import r2Cors from '../r2Cors.json';
import type { CachePurgeFile } from '../@types/CachePurgeFile';

// A wildcard pattern (the branch and commit previews) is no browser's Origin
// value, so it has no cached copy to name: preview copies age out on their TTL.
const CORS_ORIGINS = r2Cors.rules
  .flatMap((rule) => rule.allowed.origins)
  .filter((origin) => !origin.includes('*'));

/**
 * Expand URLs into purge entries covering every cached variant. The CDN keys a
 * CORS response by its `Origin`, so a bare-URL purge leaves the copy the page
 * itself fetches, and a sync leaves the page on stale bytes.
 */
export function purgeFileEntries(urls: ReadonlyArray<string>): CachePurgeFile[] {
  return urls.flatMap((url) => [
    url,
    ...CORS_ORIGINS.map((Origin) => ({ url, headers: { Origin } })),
  ]);
}
