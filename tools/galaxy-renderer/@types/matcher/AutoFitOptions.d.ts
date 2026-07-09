/**
 * AutoFitOptions — tunables + hooks for `autoFit`'s coordinate-descent loop.
 * All optional so a caller can just pass a reference/seed/category and get
 * the spike's hand-dialled defaults (116px grabs, 3 descent passes, a
 * 220000-star fit budget). `signal` is a plain mutable flag rather than an
 * `AbortController` — `autoFit` only ever needs to check "should I stop?"
 * between evaluations, and the caller sets the flag from a UI event; an
 * `AbortController`'s reason/event-listener machinery would be unused.
 */

import type { FitStepInfo } from './FitStepInfo';

export type AutoFitOptions = {
  readonly size?: number;
  readonly passes?: number;
  readonly fitStars?: number;
  readonly signal?: { stop: boolean };
  readonly onStep?: (step: FitStepInfo) => void;
};
