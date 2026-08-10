/**
 * carveStarLayout — table-driven CPU-side slot carving for the star
 * populations the generation compute shaders draw (see `GenerationLayout`'s
 * docblock for why carving happens here rather than inside a compute
 * shader). Walks populations in the shader's fixed source order — bulge,
 * bar, disk, spiral arms, irregular clumps, halo, globular-cluster stars —
 * evaluating each against `(category, params, budget)` and omitting any that
 * come out zero. Loop bounds below must match the equivalent population in
 * `milkyWay/sprites/generate.wesl`.
 */
import { POPULATION_IDS } from '../shared/populationIds';
import type { GalaxyCategory } from '../../../../@types/galaxy/GalaxyCategory';
import type { GalaxyParams } from '../../../../@types/galaxy/GalaxyParams';
import type { GenerationLayout } from '../../../../@types/galaxy/GenerationLayout';
import type { PopulationRange } from '../../../../@types/galaxy/PopulationRange';
import type { StarBudget } from '../../../../@types/galaxy/StarBudget';

type IterationsFn = (category: GalaxyCategory, params: GalaxyParams, budget: StarBudget) => number;

type StarRangeSpec = {
  readonly popId: number;
  readonly stride: number;
  readonly iterations: IterationsFn;
};

const STAR_RANGE_SPECS: readonly StarRangeSpec[] = [
  {
    // Exact count — out-of-range draws are resampled, not skipped.
    popId: POPULATION_IDS.bulge,
    stride: 1,
    iterations: (_category, _params, budget) => budget.bulgeCount,
  },
  {
    // Already zero for every category galaxyLightDecomposition gives no bar
    // light — no category test needed here.
    popId: POPULATION_IDS.bar,
    stride: 1,
    iterations: (_category, _params, budget) => budget.barCount,
  },
  {
    popId: POPULATION_IDS.disk,
    stride: 1,
    iterations: (_category, _params, budget) => budget.diskCount,
  },
  {
    // Stride 5 reserves the worst case one HII knot can write per iteration
    // (a halo glow, a core, and up to 3 newborns) — most write exactly 1.
    popId: POPULATION_IDS.spiralArms,
    stride: 5,
    iterations: (category, _params, budget) =>
      category !== 'irregular' && budget.armStarCount > 0 ? budget.armStarCount : 0,
  },
  {
    // Stride 2 reserves this population's own HII worst case: halo glow + core.
    popId: POPULATION_IDS.irregularClumps,
    stride: 2,
    iterations: (category, _params, budget) => (category === 'irregular' ? budget.armStarCount : 0),
  },
  {
    // Exact count via resampling, same as bulge.
    popId: POPULATION_IDS.halo,
    stride: 1,
    iterations: (_category, _params, budget) => budget.haloCount,
  },
  {
    // One iteration per star, not per cluster — a cluster is a fixed
    // 90-star group with no per-iteration variability GPU dispatch needs to
    // see. globularCluster itself owns no output slots and never appears here.
    popId: POPULATION_IDS.globularStar,
    stride: 1,
    iterations: (_category, params) => Math.floor(params.legacy?.globularCount || 0) * 90,
  },
];

export function carveStarLayout(
  category: GalaxyCategory,
  params: GalaxyParams,
  budget: StarBudget,
): GenerationLayout {
  const ranges: PopulationRange[] = [];
  let cursor = 0;
  for (const spec of STAR_RANGE_SPECS) {
    const iterations = spec.iterations(category, params, budget);
    if (iterations <= 0) continue;
    ranges.push({ popId: spec.popId, start: cursor, iterations, stride: spec.stride });
    cursor += iterations * spec.stride;
  }
  return { ranges, capacity: cursor };
}
