export type UseSplashInput = {
  /**
   * Optional flag set when famous-meta is known to have failed (not just
   * absent).  Drives the splash's `famous-meta-failed` informational error —
   * Explore stays live, Tour is disabled with a tooltip.  Defaults to false;
   * no caller supplies it today because the sidecar's failure path reports an
   * empty array rather than a distinguishable error, so a caller can hook a
   * tighter signal in later without breaking this hook.
   */
  famousMetaFailed?: boolean;
};
