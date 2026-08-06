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

import type { GalaxyParams } from '../../../../src/@types/galaxy/GalaxyParams';
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

// PARAM_SPEC carries five keys — hii, dustRing, dustRingWidth,
// dustRingStrength, armStart — solely to give their sliders a range; the
// spike's own randomizer looped over its 26-key `SPEC` table and never
// touched any of them (armStart didn't exist in the spike at all). Skipping
// them here keeps the draw sequence for the original 26 keys identical to
// before PARAM_SPEC grew these entries, and leaves dustRing/dustRingWidth/
// dustRingStrength/armStart undefined in randomized output (hii still gets
// its explicit category-dependent draw below; armStart's undefined means the
// describeGalaxy point-of-use default of 1, unchanged from today).
export const SLIDER_ONLY_KEYS = new Set<string>([
  'hii',
  'dustRing',
  'dustRingWidth',
  'dustRingStrength',
  'armStart',
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

  // No dust/starFormation draw any more: both moved onto `GalaxyFieldTuning`
  // (2026-08-06 reshape), which is scene-wide rather than per-galaxy, so a
  // "randomize this galaxy" click has nothing left to roll for either — every
  // background extra now shares the one scene-wide look instead of rolling
  // its own.
  return { type, ...sampled, hii, seed, asymSeed, clumpSeed, waveSeed };
}
