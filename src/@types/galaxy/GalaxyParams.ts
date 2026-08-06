/**
 * GalaxyParams — the full knob surface for the GPU galaxy-generation passes.
 * Every field is optional except `type`; the generation shaders apply the
 * spike's hand-dialled defaults at the point of use (not here, so this type
 * stays a pure description of the input shape, not a merged/defaulted one).
 *
 * The spike's `background` flag is deliberately dropped: the spike hardcodes
 * the background field to 0 regardless of the param, so the knob was dead in
 * the source this was ported from.
 *
 * Defaults (applied at point of use, exactly as the spike does — the spike
 * is external prior art, not a file in this repo):
 *
 * | param | default |
 * | --- | --- |
 * | starCount | 400000, floored, min 20000 |
 * | radius / bulgeSize / diskThickness | 1 |
 * | diskScaleLenFrac | unset = 1/3.2 of `outerRadius` (not a spike knob) |
 * | bulgeFalloff / irregularity | 0.5 |
 * | armCount | 2 |
 * | armWinding | 0.5 |
 * | armWidth | 1 |
 * | armStrength | 1 |
 * | subArms | 0 |
 * | armFalloff | 0.6 |
 * | armEdgeVar | 0 |
 * | armClump | 0.5 |
 * | armWave | 0 |
 * | armStart | 1 (not a spike knob) |
 * | barStrength | 1 |
 * | barAngleDeg | unset = drawn from the main stream |
 * | armAges | unset = alternating derived from the asym stream (not a spike knob) |
 * | youngStars | 0.5 |
 * | hii | 1 |
 * | metallicity | 0.5 |
 * | spriteDust | 1 |
 * | dustNoise | 0.6 |
 * | dustNoiseScale | 1 |
 * | dustRing | 0.72 |
 * | dustRingWidth | 0.12 |
 * | dustRingStrength | 0 |
 * | globularCount | 0 |
 * | globularSize | 1 |
 * | globularBright | 0.6 |
 * | warpStrength | 0 |
 * | warpTwist | 0 |
 * | warpStart | 0.3 |
 * | seed | `(seed\|0) \|\| 1` |
 * | asymSeed | `((asymSeed\|0) \|\| 331) >>> 0` |
 * | clumpSeed | 911 |
 * | waveSeed | 777 |
 */

export type GalaxyParams = {
  /** Hubble type: 'Sa'..'Sc', 'SBa'..'SBc', 'E0'..'E7', 'S0', 'Irr'. */
  readonly type: string;
  readonly starCount?: number;
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
  readonly armWidth?: number;
  readonly armStrength?: number;
  readonly subArms?: number;
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
  readonly hii?: number;
  /**
   * Legacy sprite-generator dust density. Renamed off the bare `dust` name,
   * which now names `GalaxyFieldTuning.dust` (the analytic dust lane) instead.
   */
  readonly spriteDust?: number;
  readonly dustNoise?: number;
  readonly dustNoiseScale?: number;
  readonly dustRing?: number;
  readonly dustRingWidth?: number;
  readonly dustRingStrength?: number;
  readonly globularCount?: number;
  readonly globularSize?: number;
  readonly globularBright?: number;
  readonly warpStrength?: number;
  readonly warpTwist?: number;
  readonly warpStart?: number;
  readonly seed?: number;
  readonly asymSeed?: number;
  readonly clumpSeed?: number;
  readonly waveSeed?: number;
};
