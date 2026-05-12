import type { Fetcher } from './Fetcher';
import type { Committer } from './Committer';
import type { RetryPolicy } from './RetryPolicy';

/**
 * Constructor arguments for `createAssetSlot`.  Carries the slot's identity
 * (`name`, surfaced in the dev panel and console logs), the typed fetcher,
 * an optional commit step (omitted for sidecar slots that don't touch the
 * GPU), and an optional retry policy (defaults to `defaultRetryPolicy`).
 */
export type CreateAssetSlotArgs<T, Req> = {
  name: string;
  fetch: Fetcher<T, Req>;
  commit?: Committer<T>;
  retry?: RetryPolicy;
};
