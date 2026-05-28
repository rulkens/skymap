import type { SplashError } from './SplashError';

/**
 * UseSplashReturn — the splash hook's public surface.
 *
 * `splashVisible` is the render gate App reads.  `blocked` reports whether
 * CTAs should be disabled (loading not yet ready).  `canContinueAnyway`
 * exposes the 8 s timer's expiration so the splash can show the escape
 * link.  `error` is null on the happy path; `famous-meta-failed` leaves
 * the splash usable, the other kinds force the error layout.
 *
 * `dismissExplore` / `dismissTour` bump localStorage's `seenVersion` and
 * close the splash.  `reopen` (called by the AboutPill) shows the splash
 * again but does NOT touch localStorage — reopening is informational, not
 * a "first-time" event.
 */
export type UseSplashReturn = {
  splashVisible: boolean;
  blocked: boolean;
  canContinueAnyway: boolean;
  error: SplashError | null;
  dismissExplore: () => void;
  dismissTour: () => void;
  reopen: () => void;
};
