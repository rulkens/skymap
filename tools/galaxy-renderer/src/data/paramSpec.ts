/**
 * PARAM_SPEC — verbatim port of the spike's `SPEC` table
 * (`Galaxy Renderer.dc.html`), plus the four sliders whose ranges the spike
 * sourced from `mk()`'s inline fallback args instead of `SPEC`
 * (`hii`/`dustRing`/`dustRingWidth`/`dustRingStrength` — see the appended
 * block below). The `[min, max, step]` shape is reshaped from a tuple into
 * `ParamSpecEntry`'s named fields.
 *
 * This is the ONLY place slider ranges exist. The spike's individual
 * `<input type="range">` elements also carried their own min/max attributes
 * (`Galaxy Renderer.dc.html`), but those were always overwritten by the
 * SPEC lookup at render time whenever SPEC had an entry — dead fallback
 * values that never took effect for those keys. They are not ported; a
 * slider with no range entry at all (e.g. `seed`, the `*Seed` fields,
 * `warpStart`) simply isn't range-constrained. The four keys `SPEC` never
 * covered are different: `mk()`'s inline fallback was the only range they
 * ever had, so it was live, not dead — those four are ported from `mk()`'s
 * call-site args instead of from `SPEC`.
 */

import type { GalaxyLegacyParams } from '../../../../src/@types/galaxy/GalaxyLegacyParams';
import type { GalaxySharedParams } from '../../../../src/@types/galaxy/GalaxySharedParams';
import type { ParamSpecEntry } from '../../@types/data/ParamSpecEntry';

// The flat slider-facing key space GalaxyParams used to be before the
// shared/legacy split — every PARAM_SPEC/slider/randomizer site still works
// in these flat names, routing into whichever bag actually owns the field
// (see `GALAXY_LEGACY_PARAM_KEYS`).
export type GalaxyParamKey = keyof GalaxySharedParams | keyof GalaxyLegacyParams;

export const PARAM_SPEC: Readonly<Partial<Record<GalaxyParamKey, ParamSpecEntry>>> = {
  radius: { min: 0.4, max: 1.8, step: 0.05 },
  // The floor is `totalStarBudget`'s own `Math.max(20000, ...)`, which this
  // tool shares with the runtime — below it the slider would show a count the
  // generator does not honour. The spike's 100k floor sat well clear of that,
  // so the clamp never showed; reaching the few-thousand-splat regime the
  // count/size trade lives in means going down to it. The step drops with the
  // floor: a range steps FROM its minimum, so the spike's 50k step would have
  // put the second stop at 70k and made the whole low end unreachable.
  starCount: { min: 20000, max: 1000000, step: 5000 },
  bulgeSize: { min: 0.2, max: 2, step: 0.05 },
  bulgeFalloff: { min: 0, max: 1, step: 0.02 },
  // Floor is below the Milky Way's calibrated 0.33: a slider whose minimum
  // excludes a shipped preset renders pinned and jumps on first drag.
  diskThickness: { min: 0.3, max: 1.8, step: 0.05 },
  irregularity: { min: 0, max: 1, step: 0.02 },
  armCount: { min: 1, max: 8, step: 1 },
  armWinding: { min: 0, max: 1, step: 0.02 },
  armWidth: { min: 0.4, max: 2, step: 0.05 },
  armStrength: { min: 0, max: 1.5, step: 0.05 },
  subArms: { min: 0, max: 1, step: 0.02 },
  armFalloff: { min: 0, max: 1, step: 0.02 },
  armEdgeVar: { min: 0, max: 1, step: 0.02 },
  armClump: { min: 0, max: 1, step: 0.02 },
  armWave: { min: 0, max: 1, step: 0.02 },
  barStrength: { min: 0.4, max: 1.6, step: 0.05 },
  spriteDust: { min: 0, max: 0.7, step: 0.05 },
  dustNoise: { min: 0, max: 1, step: 0.02 },
  dustNoiseScale: { min: 0.3, max: 3, step: 0.05 },
  youngStars: { min: 0, max: 1, step: 0.02 },
  metallicity: { min: 0, max: 1, step: 0.02 },
  warpStrength: { min: 0, max: 0.3, step: 0.01 },
  warpTwist: { min: 0, max: 6.28, step: 0.05 },
  globularCount: { min: 0, max: 100, step: 5 },
  globularSize: { min: 0.3, max: 2, step: 0.02 },
  globularBright: { min: 0.1, max: 1.5, step: 0.02 },

  // Appended, not inlined above: the spike's `SPEC` table never declared
  // these four keys, so its `mk()` helper's inline fallback ranges were the
  // *live* range for these sliders, not dead code like the fallbacks for the
  // keys `SPEC` did cover. Porting them in means extending this table rather
  // than reinventing a second range source. They go at the end, after the
  // original 26 keys, so `Object.keys(PARAM_SPEC)` — which
  // `randomGalaxyParams` iterates in declaration order — keeps drawing the
  // original 26 in their original sequence; these four are additional draws,
  // not reordered ones.
  hii: { min: 0, max: 2, step: 0.05 },
  dustRing: { min: 0.4, max: 1.1, step: 0.02 },
  dustRingWidth: { min: 0.02, max: 0.4, step: 0.01 },
  dustRingStrength: { min: 0, max: 2, step: 0.05 },

  // Not a spike knob at all — armStart doesn't exist there, unlike the four
  // above which at least had a live `mk()` fallback. Same treatment as those
  // four regardless: `SLIDER_ONLY_KEYS` skips it in `randomGalaxyParams`, so
  // adding this range doesn't reroll the gallery's arm placement on the next
  // randomize click.
  armStart: { min: 0.3, max: 1.5, step: 0.05 },
};
