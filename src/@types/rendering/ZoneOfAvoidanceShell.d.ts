/**
 * ZoneOfAvoidanceShell — the guide band's shape as one object, so the two
 * same-unit latitude limits can't be swapped positionally.
 */
export type ZoneOfAvoidanceShell = {
  readonly innerRadiusMpc: number;
  readonly outerRadiusMpc: number;
  /** Galactic-latitude half-width at the bulge end of the latitude-limit curve. */
  readonly bulgeDeg: number;
  /** Galactic-latitude half-width at the anticenter end. */
  readonly anticenterDeg: number;
};
