import type { SplashError } from './SplashError';

/**
 * UseSplashReturn — the splash hook's public surface.
 *
 * `splashVisible` is the render gate App reads.  `blocked` reports whether
 * CTAs should be disabled (loading not yet ready).  `canContinueAnyway`
 * exposes the 8 s timer's expiration so the splash can show the escape
 * link.  `error` is null on the happy path; any non-null kind forces the
 * error layout.
 *
 * `dismissExplore` / `dismissTour` dismiss the splash (marks it seen at the
 * current version) and reveal the app.  `reopen` (called by the AboutPill)
 * re-shows the splash; the dismissed version is unchanged.
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
