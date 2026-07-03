/**
 * carveDustLayout — table-driven CPU-side slot carving for the dust
 * populations `generateGalaxy` draws, mirroring `carveStarLayout`'s shape
 * (see its docblock for why carving lives here, CPU-side, ahead of any GPU
 * dispatch). Every dust population is gated on the same outer condition the
 * CPU model checks before touching dust at all — `(params.dust ?? 1) > 0 &&
 * category !== 'elliptical'` (generateGalaxy.ts:68-79) — so an ineligible
 * combination returns the empty layout up front rather than evaluating a
 * table of formulas that would all come out zero anyway.
 *
 * Per-population budgets, ported verbatim from their builders and all scaled
 * by `grainScale(budget.totalStars) ** 2` (fewer stars -> coarser grains ->
 * proportionally fewer particles for the same visual density):
 *  - armDust: `min(armStarCount, floor(30000*dust/g^2))` for spiral/barred
 *    (armDust.ts:26). The `min` against `armStarCount` is a DEVIATION from
 *    the CPU builder's literal behaviour — the real loop stops at whichever
 *    of `seeds.length` (itself usually well under `armStarCount`, since
 *    density-gap `continue`s in `buildSpiralArms` skip most stars' dust
 *    seeds) or the budget comes first, so the true written count is often
 *    far below this range's reserved slot count. Carving reserves the
 *    candidate-cap upper bound rather than the RNG-dependent realized count,
 *    since the layout must be computable before any RNG draw happens.
 *  - barDust: `floor(9000*dust/g^2)` when the barred bar has nonzero length
 *    (barDust.ts:20) — gated on the bar geometry rather than `category`
 *    directly, mirroring `buildBarDust`'s own `barLength > 0` guard.
 *  - lenticularNucDust: `floor(12000*dust/g^2)` for lenticular galaxies
 *    (lenticularDust.ts:32), independent of the ring gate below.
 *  - lenticularRingDust: `floor(34000*dustRingStrength/g^2)` for lenticular
 *    galaxies, only when `dustRingStrength > 0` (lenticularDust.ts:55) — a
 *    Sombrero-style ring is driven by its own strength knob, not `dust`.
 *  - irregularDust: `min(armStarCount, floor(16000*dust/g^2))` for irregular
 *    galaxies (irregularDust.ts:21), the same candidate-cap deviation as
 *    armDust above.
 */
import { grainScale } from './grainScale';
import { POPULATION_IDS } from './populationIds';
import type { GalaxyCategory } from '../../@types/model/GalaxyCategory';
import type { GalaxyParams } from '../../@types/model/GalaxyParams';
import type { GenerationLayout } from '../../@types/model/GenerationLayout';
import type { PopulationRange } from '../../@types/model/PopulationRange';
import type { StarBudget } from '../../@types/model/StarBudget';

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

/** Bar length, per `computeBarGeometry` — 0 for every non-barred category. */
const barLengthOf = (category: GalaxyCategory, params: GalaxyParams): number => {
  if (category !== 'barred') return 0;
  const outerRadius = 10 * (params.radius || 1);
  return outerRadius * 0.42 * (params.barStrength ?? 1);
};

const DUST_RANGE_SPECS: readonly DustRangeSpec[] = [
  {
    popId: POPULATION_IDS.armDust,
    stride: 1,
    iterations: (category, params, budget, g) =>
      category === 'spiral' || category === 'barred'
        ? Math.min(budget.armStarCount, Math.floor((30000 * (params.dust ?? 1)) / (g * g)))
        : 0,
  },
  {
    popId: POPULATION_IDS.barDust,
    stride: 1,
    iterations: (category, params, _budget, g) =>
      barLengthOf(category, params) > 0 ? Math.floor((9000 * (params.dust ?? 1)) / (g * g)) : 0,
  },
  {
    popId: POPULATION_IDS.lenticularNucDust,
    stride: 1,
    iterations: (category, params, _budget, g) =>
      category === 'lenticular' ? Math.floor((12000 * (params.dust ?? 1)) / (g * g)) : 0,
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
      category === 'irregular'
        ? Math.min(budget.armStarCount, Math.floor((16000 * (params.dust ?? 1)) / (g * g)))
        : 0,
  },
];

export function carveDustLayout(
  category: GalaxyCategory,
  params: GalaxyParams,
  budget: StarBudget,
): GenerationLayout {
  const dustAmount = params.dust ?? 1;
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
