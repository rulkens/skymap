import type { Fetcher } from './Fetcher';
import type { Committer } from './Committer';
import type { RetryPolicy } from './RetryPolicy';

/**
 * Constructor arguments for `createAssetSlot`.  Carries the slot's identity
 * (`name`, surfaced in the dev panel and console logs), the typed fetcher,
 * an optional commit step (omitted for sidecar slots that don't touch the
 * GPU), an optional un-commit hook (`onRelease`, the inverse of `commit`), and
 * an optional retry policy (defaults to `defaultRetryPolicy`).
 */
export type CreateAssetSlotArgs<T, Req> = {
  name: string;
  fetch: Fetcher<T, Req>;
  commit?: Committer<T, Req>;
  /**
   * Inverse of `commit`: run by `release()` when a committed payload is dropped,
   * so the consumer can free whatever the commit allocated (destroying a GPU
   * texture is the canonical case). Called with the committed payload, exactly
   * once per commit. Omitted for slots whose commit allocates nothing to free.
   */
  onRelease?: (payload: T) => void;
  retry?: RetryPolicy;
};
