/**
 * carveDustLayout — table-driven CPU-side slot carving for the dust
 * populations the generation compute shaders draw, mirroring
 * `carveStarLayout`'s shape (see its docblock for why carving lives here,
 * CPU-side, ahead of any GPU dispatch). Every dust population is gated on
 * the same outer condition that governs dust at all — `(params.spriteDust ?? 1) >
 * 0 && category !== 'elliptical'` — so an ineligible combination returns the
 * empty layout up front rather than evaluating a table of formulas that
 * would all come out zero anyway.
 *
 * Per-population budgets, matching the equivalent shader population's own
 * budget, all scaled by `grainScale(budget.totalStars) ** 2` (fewer stars ->
 * coarser grains -> proportionally fewer particles for the same visual
 * density). Each budget is a target the shader meets exactly: the GPU dust
 * pass runs one thread per output slot and hash-resamples the population's
 * candidate space with a fresh draw stream until each slot lands an
 * accepted candidate (see the resample-to-budget note in `generate.wesl`),
 * so the shader always emits ~budget particles regardless of how sparse the
 * accept rate is — a deliberate departure from a candidate cap, which would
 * under-emit in seed-limited regimes.
 *  - armDust: `floor(30000*spriteDust/g^2)` for spiral/barred with a nonzero arm
 *    budget. The `armStarCount > 0` gate mirrors the shader, which reads its
 *    candidate space from the spiralArms star range and dies when that range
 *    is absent — reserving budget slots for a galaxy with no arm seeds to
 *    sample would be pure dead capacity.
 *  - barDust: `floor(9000*spriteDust/g^2)` when the barred bar has nonzero length
 *    — gated on the bar geometry rather than `category` directly, mirroring
 *    the shader population's own `barLength > 0` guard.
 *  - lenticularNucDust: `floor(12000*spriteDust/g^2)` for lenticular galaxies,
 *    independent of the ring gate below.
 *  - lenticularRingDust: `floor(34000*dustRingStrength/g^2)` for lenticular
 *    galaxies, only when `dustRingStrength > 0` — a Sombrero-style ring is
 *    driven by its own strength knob, not `spriteDust`.
 *  - irregularDust: `floor(16000*spriteDust/g^2)` for irregular galaxies with a
 *    nonzero clump budget, the same resample-to-budget and
 *    `armStarCount > 0` gate as armDust above (the clump seeds live in the
 *    irregularClumps star range, sized by `armStarCount`).
 */
import { barLengthOf } from '../shared/barLengthOf';
import { grainScale } from './grainScale';
import { outerRadiusOf } from '../shared/outerRadiusOf';
import { POPULATION_IDS } from '../shared/populationIds';
import type { GalaxyCategory } from '../../../../@types/galaxy/GalaxyCategory';
import type { GalaxyParams } from '../../../../@types/galaxy/GalaxyParams';
import type { GenerationLayout } from '../../../../@types/galaxy/GenerationLayout';
import type { PopulationRange } from '../../../../@types/galaxy/PopulationRange';
import type { StarBudget } from '../../../../@types/galaxy/StarBudget';

type IterationsFn = (
  category: GalaxyCategory,
  params: GalaxyParams,
  budget: StarBudget,
  g: number,
) => number;

type DustRangeSpec = {
  readonly popId: number;
  readonly stride: number;
  readonly iterations: IterationsFn;
};

const DUST_RANGE_SPECS: readonly DustRangeSpec[] = [
  {
    popId: POPULATION_IDS.armDust,
    stride: 1,
    iterations: (category, params, budget, g) =>
      (category === 'spiral' || category === 'barred') && budget.armStarCount > 0
        ? Math.floor((30000 * (params.spriteDust ?? 1)) / (g * g))
        : 0,
  },
  {
    popId: POPULATION_IDS.barDust,
    stride: 1,
    iterations: (category, params, _budget, g) =>
      barLengthOf(category, outerRadiusOf(params), params.barStrength) > 0
        ? Math.floor((9000 * (params.spriteDust ?? 1)) / (g * g))
        : 0,
  },
  {
    popId: POPULATION_IDS.lenticularNucDust,
    stride: 1,
    iterations: (category, params, _budget, g) =>
      category === 'lenticular' ? Math.floor((12000 * (params.spriteDust ?? 1)) / (g * g)) : 0,
  },
  {
    popId: POPULATION_IDS.lenticularRingDust,
    stride: 1,
    iterations: (category, params, _budget, g) => {
      const ringAmt = params.dustRingStrength ?? 0;
      return category === 'lenticular' && ringAmt > 0 ? Math.floor((34000 * ringAmt) / (g * g)) : 0;
    },
  },
  {
    popId: POPULATION_IDS.irregularDust,
    stride: 1,
    iterations: (category, params, budget, g) =>
      category === 'irregular' && budget.armStarCount > 0
        ? Math.floor((16000 * (params.spriteDust ?? 1)) / (g * g))
        : 0,
  },
];

export function carveDustLayout(
  category: GalaxyCategory,
  params: GalaxyParams,
  budget: StarBudget,
): GenerationLayout {
  const dustAmount = params.spriteDust ?? 1;
  if (!(dustAmount > 0) || category === 'elliptical') {
    return { ranges: [], capacity: 0 };
  }

  const g = grainScale(budget.totalStars);
  const ranges: PopulationRange[] = [];
  let cursor = 0;
  for (const spec of DUST_RANGE_SPECS) {
    const iterations = spec.iterations(category, params, budget, g);
    if (iterations <= 0) continue;
    ranges.push({ popId: spec.popId, start: cursor, iterations, stride: spec.stride });
    cursor += iterations * spec.stride;
  }
  return { ranges, capacity: cursor };
}
