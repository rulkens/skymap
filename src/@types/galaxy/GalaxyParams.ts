/**
 * GalaxyParams — the full knob surface for the GPU galaxy-generation passes.
 * Every field is optional except `type`; the generation shaders apply the
 * spike's hand-dialled defaults at the point of use (not here, so this type
 * stays a pure description of the input shape, not a merged/defaulted one).
 *
 * The spike's `background` flag is deliberately dropped: galaxy-model.js:117
 * hardcodes the background field to 0 regardless of the param, so the knob
 * was dead in the source this was ported from.
 *
 * Defaults (applied at point of use, exactly as the spike does):
 *
 * | param | default | spike cite |
 * | --- | --- | --- |
 * | starCount | 400000, floored, min 20000 | model.js:89 |
 * | radius / bulgeSize / diskThickness | 1 | model.js:86-88 |
 * | diskScaleLenFrac | unset = 1/3.2 of `outerRadius` | not a spike knob |
 * | bulgeFalloff / irregularity | 0.5 | model.js:192 / 179 |
 * | armCount | 2 | model.js:288 |
 * | armWinding | 0.5 | model.js:289 |
 * | armWidth | 1 | model.js:292 |
 * | armStrength | 1 | model.js:111 |
 * | subArms | 0 | model.js:293 |
 * | armFalloff | 0.6 | model.js:298 |
 * | armEdgeVar | 0 | model.js:300 |
 * | armClump | 0.5 | model.js:302 |
 * | armWave | 0 | model.js:294 |
 * | barStrength | 1 | model.js:228 |
 * | barAngleDeg | unset = drawn from the main stream | model.js:229 |
 * | armAges | unset = alternating derived from the asym stream | not a spike knob |
 * | youngStars | 0.5 | model.js:167 |
 * | hii | 1 | model.js:303 |
 * | metallicity | 0.5 | model.js:131 |
 * | spriteDust | 1 | model.js:488 |
 * | dustNoise | 0.6 | model.js:505 |
 * | dustNoiseScale | 1 | model.js:506 |
 * | dustRing | 0.72 | model.js:572 |
 * | dustRingWidth | 0.12 | model.js:573 |
 * | dustRingStrength | 0 | model.js:571 |
 * | globularCount | 0 | model.js:118 |
 * | globularSize | 1 | model.js:453 |
 * | globularBright | 0.6 | model.js:454 |
 * | warpStrength | 0 | model.js:141 |
 * | warpTwist | 0 | model.js:142 |
 * | warpStart | 0.3 | model.js:146 |
 * | seed | `(seed\|0) \|\| 1` | model.js:79 |
 * | asymSeed | `((asymSeed\|0) \|\| 331) >>> 0` | model.js:180 |
 * | clumpSeed | 911 | model.js:296 |
 * | waveSeed | 777 | model.js:295 |
 *
 * `dust` (the analytic dust-lane section) has no row above: absent means the
 * point-of-use default, `DEFAULT_GALAXY_DUST_PARAMS`, not a spike knob.
 */

import type { GalaxyDustParams } from './GalaxyDustParams';

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
   * Legacy sprite-generator dust density (model.js:488). Renamed off the bare
   * `dust` name so the analytic dust-lane section below can own it instead.
   */
  readonly spriteDust?: number;
  readonly dustNoise?: number;
  readonly dustNoiseScale?: number;
  readonly dustRing?: number;
  readonly dustRingWidth?: number;
  readonly dustRingStrength?: number;
  /** Analytic dust lane. Absent means `DEFAULT_GALAXY_DUST_PARAMS` (point of use). */
  readonly dust?: GalaxyDustParams;
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
