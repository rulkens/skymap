/**
 * GalaxyDustNetworkParams — the PHANGS-style filament/bubble network layered
 * on the flat analytic dust lane (design: `docs/grill-sessions/analytic-dust-lane-2026-08-01.md`
 * Part 2, N4). Masters are physical anchors that randomize rolls; refiners
 * are ×measured-default scalers where 1.0 reproduces the literature value —
 * documented once here rather than per field.
 */
export type GalaxyDustNetworkParams = {
  /** Molecular arm/interarm contrast (measured ~2–5); deliberately larger than the stellar K≈1.3. */
  readonly armContrast: number;
  /** Star-formation event rate scale; drives the bubble catalog now, HII knots later. */
  readonly sfActivity: number;
  /** Zero-mean small-scale structure amplitude; 0 = smooth lane, 1 = full PHANGS crinkle. */
  readonly texture: number;
  /** Spur/feather prominence. */
  readonly spurStrength: number;
  readonly laneWidth: number;
  /** Density-wave shock displacement from the stellar ridge. */
  readonly laneOffset: number;
  readonly spurSpacing: number;
  readonly spurLength: number;
  readonly bubbleScale: number;
  /** 0..1, not a scaler: 0 = pure holes, 1 = strong swept rims. */
  readonly bubbleRimStrength: number;
  /** 0..1: how much of `texture` is discrete GMC beads vs continuous crinkle. */
  readonly beadShare: number;
};
