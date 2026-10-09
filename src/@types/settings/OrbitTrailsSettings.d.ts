/**
 * OrbitTrailsSettings — near-field Keplerian orbit trails. Defaults on;
 * `orbitTrailsPass` multiplies its per-orbit fade by this gate's fade opacity,
 * so toggling dissolves rather than pops.
 */

export type OrbitTrailsSettings = {
  enabled: boolean;
  /** A `SAMPLED_BODIES` id whose mission trail and caption stay full strength while the other
   *  sampled craft dim; null = no emphasis. */
  readonly emphasis: string | null;
};
