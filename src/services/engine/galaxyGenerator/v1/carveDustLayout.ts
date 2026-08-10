/**
 * carveDustLayout — table-driven CPU-side slot carving for the dust
 * populations the generation compute shaders draw, mirroring
 * `carveStarLayout`'s shape (see its docblock for why carving happens here,
 * CPU-side, ahead of any GPU dispatch). Each budget below is a target the
 * GPU dust pass meets exactly via resample-to-budget, not a candidate cap
 * (see `generate.wesl`) — it hash-resamples the population's candidate space
 * with a fresh draw stream until every slot lands an accepted candidate, so
 * it always emits ~budget particles regardless of accept rate.
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
    // Gated on the shader's own candidate space: spiralArms seeds this
    // population, and dies with no range to sample from otherwise.
    popId: POPULATION_IDS.armDust,
    stride: 1,
    iterations: (category, params, budget, g) =>
      (category === 'spiral' || category === 'barred') && budget.armStarCount > 0
        ? Math.floor((30000 * (params.legacy?.spriteDust ?? 1)) / (g * g))
        : 0,
  },
  {
    // Gated on bar geometry (mirrors the shader's own barLength>0 guard),
    // not on category directly.
    popId: POPULATION_IDS.barDust,
    stride: 1,
    iterations: (category, params, _budget, g) =>
      barLengthOf(category, outerRadiusOf(params), params.shared.barStrength) > 0
        ? Math.floor((9000 * (params.legacy?.spriteDust ?? 1)) / (g * g))
        : 0,
  },
  {
    // Independent of the ring gate below.
    popId: POPULATION_IDS.lenticularNucDust,
    stride: 1,
    iterations: (category, params, _budget, g) =>
      category === 'lenticular'
        ? Math.floor((12000 * (params.legacy?.spriteDust ?? 1)) / (g * g))
        : 0,
  },
  {
    // A Sombrero-style ring is driven by its own strength knob, not spriteDust.
    popId: POPULATION_IDS.lenticularRingDust,
    stride: 1,
    iterations: (category, params, _budget, g) => {
      const ringAmt = params.legacy?.dustRingStrength ?? 0;
      return category === 'lenticular' && ringAmt > 0 ? Math.floor((34000 * ringAmt) / (g * g)) : 0;
    },
  },
  {
    // Same arm-budget gate as armDust: clump seeds live in the
    // irregularClumps star range, sized by armStarCount.
    popId: POPULATION_IDS.irregularDust,
    stride: 1,
    iterations: (category, params, budget, g) =>
      category === 'irregular' && budget.armStarCount > 0
        ? Math.floor((16000 * (params.legacy?.spriteDust ?? 1)) / (g * g))
        : 0,
  },
];

export function carveDustLayout(
  category: GalaxyCategory,
  params: GalaxyParams,
  budget: StarBudget,
): GenerationLayout {
  // Dust as a whole is off for spriteDust<=0 or an elliptical category —
  // return the empty layout up front rather than evaluate every spec's
  // formula, which would all come out zero anyway.
  const dustAmount = params.legacy?.spriteDust ?? 1;
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
