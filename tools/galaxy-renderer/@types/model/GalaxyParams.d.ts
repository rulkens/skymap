/**
 * GalaxyParams — the full knob surface for `generateGalaxy`. Every field is
 * optional except `type`; the generator applies the spike's hand-dialled
 * defaults at the point of use (not here, so this type stays a pure
 * description of the input shape, not a merged/defaulted one).
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
 * | youngStars | 0.5 | model.js:167 |
 * | hii | 1 | model.js:303 |
 * | metallicity | 0.5 | model.js:131 |
 * | dust | 1 | model.js:488 |
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
 */

export type GalaxyParams = {
  /** Hubble type: 'Sa'..'Sc', 'SBa'..'SBc', 'E0'..'E7', 'S0', 'Irr'. */
  readonly type: string;
  readonly starCount?: number;
  readonly radius?: number;
  readonly bulgeSize?: number;
  readonly bulgeFalloff?: number;
  readonly diskThickness?: number;
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
  readonly youngStars?: number;
  readonly metallicity?: number;
  readonly hii?: number;
  readonly dust?: number;
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
