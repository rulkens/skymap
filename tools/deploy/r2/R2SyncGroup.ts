import type { R2Transport } from './R2Transport';
import type { R2Upload } from './R2Upload';

/**
 * A named batch of uploads that share an upload policy.
 *
 * `files` is empty when the batch's build step hasn't run — a fresh checkout
 * has no hi-res images and no baked tiles — so an absent group is normal, not
 * an error.
 *
 * `purge` is false only for content that is immutable by construction, where
 * a new version means new keys. Setting it false for anything else silently
 * serves stale bytes for the whole `cacheControl` window.
 */
export type R2SyncGroup = {
  readonly label: string;
  readonly files: readonly R2Upload[];
  readonly transport: R2Transport;
  readonly cacheControl: string;
  readonly purge: boolean;
};
