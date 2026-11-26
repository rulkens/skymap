/** A file's raw and gzip-on-wire MD5s differ, so each gets its own cache entry. */
export function localHashCacheKey(localPath: string, gzipOnWire: boolean): string {
  return `${gzipOnWire ? 'gzip' : 'raw'}:${localPath}`;
}
