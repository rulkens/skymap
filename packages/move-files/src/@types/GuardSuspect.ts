import type { GuardFinding } from './GuardFinding';

/** A possible guard finding, not yet confirmed to be a string rather than a comment. */
export type GuardSuspect = { readonly index: number; readonly reason: GuardFinding['reason'] };
