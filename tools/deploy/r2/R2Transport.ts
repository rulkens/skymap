/**
 * How a group's bytes get to the bucket.
 *
 * `wrangler` spawns one `npx wrangler r2 object put` per file. At ~1-2 s of
 * Node startup per spawn that is fine for dozens of large artefacts and
 * hopeless for thousands of small ones — 10912 tiles would take 3-6 hours
 * before any bytes moved.
 *
 * `bulk` hands the whole group to a single `rclone copy`, which owns listing,
 * diffing, retry and concurrency. It needs the local directory and bucket
 * prefix the group's files hang off, because rclone works in terms of a tree
 * plus a relative file list, not absolute key pairs.
 */
export type R2Transport =
  | { readonly kind: 'wrangler' }
  | { readonly kind: 'bulk'; readonly localRoot: string; readonly keyRoot: string };
