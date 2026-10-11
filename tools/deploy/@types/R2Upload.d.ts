/**
 * One local file paired with the bucket key it lands under.
 *
 * Every selection source produces this shape, so the uploader never learns
 * where a file came from — which is what lets a new source be a row in the
 * GROUPS table rather than another branch in the upload loop.
 */
export type R2Upload = {
  readonly localPath: string;
  readonly r2Key: string;
};
