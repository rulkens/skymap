import type { RetryDecision } from './RetryDecision';

/**
 * Retry policy: a pure function `(attempt, error) → decision`.  No mutable
 * state, no clock reads, no I/O — a property of the inputs only.  This makes
 * the policy trivially testable across status codes and attempt counts.
 */
export type RetryPolicy = (attempt: number, error: Error) => RetryDecision;
