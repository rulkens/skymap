import r2Cors from '../r2Cors.json';
import type { CachePurgeFile } from './CachePurgeFile';

const CORS_ORIGINS = r2Cors.rules.flatMap((rule) => rule.allowed.origins);

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
