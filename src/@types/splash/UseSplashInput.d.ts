export type UseSplashInput = {
  /** Famous-meta `ready` flag from `useFamousMeta`. */
  famousMetaReady: boolean;
  /**
   * Optional flag set by App.tsx when famous-meta is known to have failed
   * (not just absent).  Drives the splash's `famous-meta-failed` informational
   * error — Explore stays live, Tour is disabled with a tooltip.  Defaults
   * to false; the famousMetaFetcher currently swallows errors silently, so
   * App can hook a tighter signal in later without breaking this hook.
   */
  famousMetaFailed?: boolean;
};
