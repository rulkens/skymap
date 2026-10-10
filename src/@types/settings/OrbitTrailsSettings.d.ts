/**
 * OrbitTrailsSettings — near-field Keplerian orbit trails. Defaults on;
 * `orbitTrailsPass` multiplies its per-orbit fade by this gate's fade opacity,
 * so toggling dissolves rather than pops.
 */

export type OrbitTrailsSettings = {
  enabled: boolean;
};
