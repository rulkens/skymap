/**
 * Retry policy decision.  `give-up` ends the retry loop; `{delayMs}` schedules
 * the next attempt after sleeping the indicated milliseconds.
 *
 * Pure function `(attempt, error) → decision`.  No mutable state, no clock
 * reads, no I/O — a property of the inputs only.  This makes the policy
 * trivially testable across status codes and attempt counts.
 */
export type RetryDecision = { delayMs: number } | 'give-up';
