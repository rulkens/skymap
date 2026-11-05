import type { SplashError } from './SplashError';

/**
 * UseSplashReturn — the splash hook's public surface.
 *
 * `splashVisible` is the render gate App reads.  `blocked` reports whether
 * CTAs should be disabled (the engine is not drawing yet).  `error` is null
 * on the happy path; any non-null kind forces the error layout.
 *
 * `dismissExplore` / `dismissTour` dismiss the splash (marks it seen at the
 * current version) and reveal the app.  `reopen` (called by the AboutPill)
 * re-shows the splash; the dismissed version is unchanged.
 */
export type UseSplashReturn = {
  splashVisible: boolean;
  blocked: boolean;
  error: SplashError | null;
  dismissExplore: () => void;
  dismissTour: () => void;
  reopen: () => void;
};
