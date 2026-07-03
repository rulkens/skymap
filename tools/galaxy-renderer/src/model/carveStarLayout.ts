/**
 * carveStarLayout — table-driven CPU-side slot carving for the star
 * populations `generateGalaxy` draws (Task 1's CPU/GPU seam; see
 * `GenerationLayout`'s docblock for why carving happens here rather than
 * inside a compute shader). Walks the star populations in the CPU model's
 * fixed source order — bulge, bar, disk, spiral arms, irregular clumps,
 * halo, globular-cluster stars — evaluating each population's iteration
 * count against `(category, params, budget)` and omitting any that come out
 * zero, the same table-dispatch shape `splitStarBudget` uses for its
 * per-category split rather than an if/else predicate chain.
 *
 * Per-population loop bounds, ported verbatim from their builders:
 *  - bulge: `budget.bulgeCount` (bulge.ts:39, an exact count — the builder's
 *    out-of-range draws are *resampled*, not skipped).
 *  - bar: barred galaxies spend `floor(diskCount*0.35)` of the disk budget on
 *    the bar (bar.ts:26); every other category gets none.
 *  - disk: the remainder of `diskCount` after the bar's share for barred
 *    galaxies, or the full `diskCount` otherwise (disk.ts:42-45).
 *  - spiralArms (stride 5): `budget.armStarCount` iterations for every
 *    non-irregular category with a nonzero arm budget (spiralArms.ts:41);
 *    stride 5 reserves the worst case an HII knot can write in one
 *    iteration — a halo glow, a core, and up to 3 newborns
 *    (spiralArms.ts:194-219) — even though most iterations write exactly 1.
 *  - irregularClumps (stride 2): `budget.armStarCount` iterations for
 *    irregular galaxies only (irregularClumps.ts:60-90); stride 2 reserves
 *    that builder's own HII worst case, a halo glow plus a core.
 *  - halo: `budget.haloCount` (halo.ts, an exact count via resampling, same
 *    as the bulge).
 *  - globularStar: `floor(globularCount || 0) * 90` — one iteration per
 *    star, not per cluster, since a cluster is just a fixed-size (90-star)
 *    group with no internal variability GPU dispatch needs to see
 *    (globularClusters.ts:18-27). The per-cluster loop itself
 *    (`POPULATION_IDS.globularCluster`) owns no output slots and never
 *    appears in this layout.
 */
import { POPULATION_IDS } from './populationIds';
import type { GalaxyCategory } from '../../@types/model/GalaxyCategory';
import type { GalaxyParams } from '../../@types/model/GalaxyParams';
import type { GenerationLayout } from '../../@types/model/GenerationLayout';
import type { PopulationRange } from '../../@types/model/PopulationRange';
import type { StarBudget } from '../../@types/model/StarBudget';

type IterationsFn = (category: GalaxyCategory, params: GalaxyParams, budget: StarBudget) => number;

type StarRangeSpec = {
  readonly popId: number;
  readonly stride: number;
  readonly iterations: IterationsFn;
};

const barStarCount = (budget: StarBudget): number => Math.floor(budget.diskCount * 0.35);

const STAR_RANGE_SPECS: readonly StarRangeSpec[] = [
  {
    popId: POPULATION_IDS.bulge,
    stride: 1,
    iterations: (_category, _params, budget) => budget.bulgeCount,
  },
  {
    popId: POPULATION_IDS.bar,
    stride: 1,
    iterations: (category, _params, budget) => (category === 'barred' ? barStarCount(budget) : 0),
  },
  {
    popId: POPULATION_IDS.disk,
    stride: 1,
    iterations: (category, _params, budget) =>
      category === 'barred' ? budget.diskCount - barStarCount(budget) : budget.diskCount,
  },
  {
    popId: POPULATION_IDS.spiralArms,
    stride: 5,
    iterations: (category, _params, budget) =>
      category !== 'irregular' && budget.armStarCount > 0 ? budget.armStarCount : 0,
  },
  {
    popId: POPULATION_IDS.irregularClumps,
    stride: 2,
    iterations: (category, _params, budget) => (category === 'irregular' ? budget.armStarCount : 0),
  },
  {
    popId: POPULATION_IDS.halo,
    stride: 1,
    iterations: (_category, _params, budget) => budget.haloCount,
  },
  {
    popId: POPULATION_IDS.globularStar,
    stride: 1,
    iterations: (_category, params) => Math.floor(params.globularCount || 0) * 90,
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
