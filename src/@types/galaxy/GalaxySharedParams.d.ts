/**
 * GalaxySharedParams — the knobs `describeGalaxy` reads to build a
 * `GalaxyDescription`, so both v1 (sprites) and v2 (analytic field) see the
 * same shape. Every field optional; defaults are applied at the point of use
 * (`describeGalaxy` et al.), exactly as `GalaxyParams`'s docblock describes.
 */

export type GalaxySharedParams = {
  readonly radius?: number;
  readonly bulgeSize?: number;
  readonly bulgeFalloff?: number;
  readonly diskThickness?: number;
  /**
   * Disc scale length as a FRACTION of `outerRadius`. Absent means 1/3.2, the
   * ratio every galaxy type shares (`packGenerationUniforms`); set, it retunes
   * one galaxy's radial light profile without moving that shared constant.
   */
  readonly diskScaleLenFrac?: number;
  readonly irregularity?: number;
  readonly armCount?: number;
  readonly armWinding?: number;
  readonly armFalloff?: number;
  readonly armEdgeVar?: number;
  readonly armClump?: number;
  readonly armWave?: number;
  /**
   * Multiplier on `GalaxyDescription.armStartRadius`
   * (`describeGalaxy.ts`'s `Math.max(category === 'barred' ? bar.barLength *
   * 0.9 : bulgeRadius * 0.55, bulgeRadius * 0.4)`, itself off
   * `bulgeRadius = outerRadius * 0.34 * bulgeSize`) — the only knob that
   * moves where the arms begin. SHARED geometry: both v1 (sprites) and v2
   * (analytic field) place arm material against `armStartRadius`, so this
   * scales both at once. Absent means 1, today's derivation unchanged.
   */
  readonly armStart?: number;
  readonly barStrength?: number;
  /**
   * Bar position angle in DEGREES about the disc pole. Absent (the spike's
   * behaviour, and every preset that says nothing) means the angle is a small
   * random tilt off `irregularity`; set, it pins the bar and the RNG draw is
   * consumed and discarded so no other generated star moves.
   */
  readonly barAngleDeg?: number;
  /**
   * Per-arm age in [0,1] (0 = young gas arm, 1 = old stellar arm), indexed by
   * arm number. Absent (every preset that says nothing) means each arm's age
   * is derived from the asymmetry stream: alternating strong/weak bands (even
   * arms old, odd arms young) with jitter, so a random galaxy naturally shows
   * a mix of arm ages rather than one uniform contrast. Set, an entry pins
   * that arm's age and the RNG draw is still consumed and discarded, same
   * discipline as `barAngleDeg`.
   */
  readonly armAges?: readonly number[];
  readonly youngStars?: number;
  readonly metallicity?: number;
  readonly warpStrength?: number;
  readonly warpTwist?: number;
  readonly warpStart?: number;
  readonly seed?: number;
  readonly asymSeed?: number;
  readonly clumpSeed?: number;
  readonly waveSeed?: number;
};
