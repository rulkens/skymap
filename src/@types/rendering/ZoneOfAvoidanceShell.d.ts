/**
 * ZoneOfAvoidanceShell — the guide band's shape, as one object rather than
 * four adjacent `number` params: `bulgeDeg` and `anticenterDeg` are both
 * degrees and both plausible in each other's slot, so a positional swap
 * type-checked and produced a band that looked wrong instead of a compile
 * error. Naming each field removes the hazard by construction.
 */
export type ZoneOfAvoidanceShell = {
  /** Inner radius of the visible shell, Mpc. */
  readonly innerRadiusMpc: number;
  /** Outer radius of the visible shell, Mpc. */
  readonly outerRadiusMpc: number;
  /** Half-width, in degrees of galactic latitude, of the bulge end of the longitude-dependent latitude-limit curve. */
  readonly bulgeDeg: number;
  /** Half-width, in degrees of galactic latitude, of the anticenter end of the same curve. */
  readonly anticenterDeg: number;
};
