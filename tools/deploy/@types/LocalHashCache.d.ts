/**
 * `hashLocalFiles`' on-disk memo of `localUploadHash`, keyed by
 * `localHashCacheKey`. An entry holds only while the file's size and mtime
 * still match; `lookupLocalHash` is the one reader that decides that.
 */
export type LocalHashCache = Readonly<
  Record<string, { readonly size: number; readonly mtimeMs: number; readonly md5: string }>
>;
