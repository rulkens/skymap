import type { R2Upload } from './R2Upload';

/**
 * A named batch of uploads that share an upload policy.
 *
 * `files` is empty when the batch's build step hasn't run — a fresh checkout
 * has no hi-res images and no baked tiles — so an absent group is normal, not
 * an error.
 */
export type R2SyncGroup = {
  readonly label: string;
  readonly files: readonly R2Upload[];
};
