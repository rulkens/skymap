/** `failed` is the path that stopped the batch, or null; `completed` are absolute paths in place. */
export type ApplyResult = {
  readonly failed: string | null;
  readonly completed: readonly string[];
};
