/** One R2 upload of a live dataset: `path` is relative to `public/data`, `key` the bucket key. */
export type PublishEntry = {
  path: string;
  key: string;
  contentType: string;
  cacheControl: string;
  gzip: boolean;
};
