import type { R2Transport } from './R2Transport';
import type { R2Upload } from './R2Upload';

/**
 * A named batch of uploads sharing one policy. `files` is empty when the
 * batch's build step hasn't run (no hi-res images, no baked tiles), which is
 * normal. `purge: false` is only for content immutable by construction; for
 * anything else it serves stale bytes for the whole `cacheControl` window.
 * `gzipOnWire` picks the bytes R2 stores, so the ETag diff hashes the same.
 */
export type R2SyncGroup = {
  readonly label: string;
  readonly files: readonly R2Upload[];
  readonly transport: R2Transport;
  readonly cacheControl: string;
  readonly purge: boolean;
  readonly gzipOnWire: boolean;
};
