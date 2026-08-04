/**
 * randomGalaxyParams — port of the spike's `randomParams` method
 * (`Galaxy Renderer.dc.html`): draws a full random `GalaxyParams` by
 * picking a Hubble type uniformly, then sampling every `PARAM_SPEC` key
 * uniformly in its `[min, max]` range and snapping to `step`.
 *
 * The RNG is injected rather than reaching for `Math.random()` directly, so
 * the same call sequence is reproducible under test (and, at the UI layer,
 * under an entropy-seeded `mulberry32` for a normal "surprise me" click).
 * This mirrors the house rule that governs every pure function in this
 * package, model layer included: never own your own entropy source.
 */

import type { GalaxyDustParams } from '../../../../src/@types/galaxy/GalaxyDustParams';
import type { GalaxyParams } from '../../../../src/@types/galaxy/GalaxyParams';
import type { GalaxyStarFormationParams } from '../../../../src/@types/galaxy/GalaxyStarFormationParams';
import { DEFAULT_GALAXY_DUST_CLOUD_PARAMS } from '../../../../src/services/engine/galaxyGenerator/v2/defaultGalaxyDustCloudParams';
import { DEFAULT_GALAXY_DUST_PARAMS } from '../../../../src/services/engine/galaxyGenerator/v2/defaultGalaxyDustParams';
import { DEFAULT_GALAXY_STAR_FORMATION_PARAMS } from '../../../../src/services/engine/galaxyGenerator/v2/defaultGalaxyStarFormationParams';
import { PARAM_SPEC } from './paramSpec';
import { classifyHubbleType } from '../../../../src/services/engine/galaxyGenerator/shared/classifyHubbleType';

// The spike's fixed 14-entry type roster — every Hubble stage the
// generator knows how to shape, verbatim.
const TYPES: readonly string[] = [
  'Sa',
  'Sb',
  'Sc',
  'SBa',
  'SBb',
  'SBc',
  'E0',
  'E1',
  'E2',
  'E3',
  'E5',
  'E7',
  'S0',
  'Irr',
];

// PARAM_SPEC carries four keys — hii, dustRing, dustRingWidth,
// dustRingStrength — solely to give their sliders a range; the spike's own
// randomizer looped over its 26-key `SPEC` table and never
// touched any of the four. Skipping them here keeps the draw sequence for
// the original 26 keys identical to before PARAM_SPEC grew these entries,
// and leaves dustRing/dustRingWidth/dustRingStrength undefined in randomized
// output (hii still gets its explicit category-dependent draw below).
export const SLIDER_ONLY_KEYS = new Set<string>([
  'hii',
  'dustRing',
  'dustRingWidth',
  'dustRingStrength',
]);

export function randomGalaxyParams(
  rng: () => number,
  opts: { readonly includeSize: boolean },
): GalaxyParams {
  // `rng()` is always < 1, so the index is always in [0, TYPES.length) —
  // the non-null assertion documents that guarantee rather than working
  // around a real possibility of an out-of-bounds pick.
  const type = TYPES[(rng() * TYPES.length) | 0]!;

  // Mutable accumulator mirrors the spike's `for (const k in SPEC)` loop —
  // the PARAM_SPEC key set isn't known until iterated, so a literal object
  // isn't practical here.
  const sampled: Record<string, number> = {};
  for (const key of Object.keys(PARAM_SPEC) as (keyof GalaxyParams & string)[]) {
    if (!opts.includeSize && (key === 'radius' || key === 'starCount')) continue;
    if (SLIDER_ONLY_KEYS.has(key)) continue;
    const { min, max, step } = PARAM_SPEC[key]!;
    let value = min + rng() * (max - min);
    if (step) value = Math.round(value / step) * step;
    sampled[key] = Math.min(max, Math.max(min, value));
  }

  // hii is a slider-only PARAM_SPEC key (skipped above), so this explicit,
  // unstepped draw — matching the spike's randomizer — is the
  // only place hii gets a value, with the irregular category's tighter
  // [0, 0.5] cap that PARAM_SPEC's single [0, 2] range can't express.
  const hii = classifyHubbleType(type) === 'irregular' ? rng() * 0.5 : rng() * 2;
  const seed = (rng() * 1e9) | 0;
  const asymSeed = (rng() * 1e9) | 0;
  const clumpSeed = (rng() * 1e9) | 0;
  const waveSeed = (rng() * 1e9) | 0;

  // The randomizer stays inside the MEASURED ranges (GalaxyDustParams'
  // docblock); the sliders' wider spans exist for exploration, not for this
  // draw.
  const dust: GalaxyDustParams = {
    ...DEFAULT_GALAXY_DUST_PARAMS,
    tau: 0.2 + rng() * 0.8,
    scaleLenRatio: 1.4 + rng() * 0.35,
    heightRatio: 0.25 + rng() * 0.5,
    // R_V is a real galaxy-to-galaxy dust-grain property (unlike the taste
    // scalers below, left fixed) — spans diffuse-ISM to dense-cloud MW-like
    // sightlines (2.4-4.0), short of SMC/starburst territory.
    rV: 2.4 + rng() * 1.6,
    cloud: {
      ...DEFAULT_GALAXY_DUST_CLOUD_PARAMS,
      // Only the knobs that read as a galaxy's own ISM character get rolled:
      // how richly it is resolved into clouds, how large its complexes run,
      // and how eroded their silhouettes are. The rest are taste scalers,
      // left at their calibrated value. Clumpiness stays at the default 0 —
      // any scatter around the seed points re-blurs the map-exact placement
      // (see dustParticleCloud.ts's mapDensity comment).
      count: Math.round(6000 + rng() * 12000),
      sizeScale: 0.7 + rng() * 0.9,
      texture: 0.4 + rng() * 0.6,
    },
  };

  const starFormation: GalaxyStarFormationParams = {
    ...DEFAULT_GALAXY_STAR_FORMATION_PARAMS,
    sfActivity: 0.3 + rng() * 1.7,
  };

  return { type, ...sampled, hii, seed, asymSeed, clumpSeed, waveSeed, dust, starFormation };
}
