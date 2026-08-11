// src/services/loading/retryPolicy.ts
/**
 * defaultRetryPolicy — pure decision function for asset-load retries.
 *
 * Rules:
 *   - 4xx (except 408 and 429) → permanent failure.  The server told us the
 *     request itself is wrong; retrying gets the same answer.
 *   - 408 (Request Timeout), 429 (Too Many Requests), all 5xx, and generic
 *     network errors → retry with exponential-ish backoff [1s, 3s].  Two
 *     retries is the empirically-tuned sweet spot: enough to ride out a
 *     transient blip, few enough that a real outage fails the user fast.
 *   - AbortError → give-up.  The slot itself handles aborts (they mean
 *     "supersession", not "transient failure"), but if one ever leaks in
 *     here we don't want to schedule a retry against an aborted controller.
 *
 * Why a function and not a class?  No state to carry — the decision is a
 * property of `(attempt, error)` only.  A pure function is trivially
 * testable, trivially swappable, and impossible to misuse by mistake.
 */
import type { RetryDecision } from '../../@types/loading/RetryDecision';
import type { RetryPolicy } from '../../@types/loading/RetryPolicy';
import { FormatVersionError } from '../../data/formatVersionError';
import { HttpError } from './fetchWithProgress';

const BACKOFF_MS = [1000, 3000];

export const defaultRetryPolicy: RetryPolicy = (attempt: number, error: Error): RetryDecision => {
  if (error.name === 'AbortError') return 'give-up';

  // A version mismatch is deterministic — retrying re-downloads ~100 MB for
  // the same answer.
  if (error instanceof FormatVersionError) return 'give-up';

  if (error instanceof HttpError) {
    const code = error.status;
    // 4xx that doesn't deserve a retry.
    if (code >= 400 && code < 500 && code !== 408 && code !== 429) return 'give-up';
  }

  // All other errors: 5xx, 408, 429, network errors → retry with backoff.
  // The bounds check above guarantees the index is in-range; the `!` placates
  // `noUncheckedIndexedAccess` without weakening the contract at runtime.
  if (attempt >= BACKOFF_MS.length) return 'give-up';
  return { delayMs: BACKOFF_MS[attempt]! };
};
