/**
 * GalaxyParams — the full knob surface for the GPU galaxy-generation passes,
 * split by consumer: `shared` feeds `describeGalaxy` (both v1 and v2 read the
 * resulting `GalaxyDescription`); `legacy` is read directly by v1's sprite
 * generator alone and dies with `galaxyGenerator/v1/`.
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
import type { GalaxyLegacyParams } from './GalaxyLegacyParams';
import type { GalaxySharedParams } from './GalaxySharedParams';

export type GalaxyParams = {
  /** Hubble type: 'Sa'..'Sc', 'SBa'..'SBc', 'E0'..'E7', 'S0', 'Irr'. Stays bare — every branch keys off it first. */
  readonly type: string;
  readonly shared: GalaxySharedParams;
  /** v1 sprite generator only — dies with `galaxyGenerator/v1/`. */
  readonly legacy?: GalaxyLegacyParams;
};
