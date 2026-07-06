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
 *  - armDust: `floor(30000*dust/g^2)` for spiral/barred with a nonzero arm
 *    budget (armDust.ts:26). This is the CPU builder's own budget — the count
 *    it pushes up to before stopping — reserved one output slot per particle.
 *    The GPU dust pass runs one thread per slot and RESAMPLES the arm-seed
 *    candidate space until each lands an accepted seed (see the
 *    resample-to-budget note in generate.wesl), so it writes ~budget particles
 *    just as the CPU does. The `armStarCount > 0` gate mirrors the shader,
 *    which reads its candidate space from the spiralArms star range and dies
 *    when that range is absent — reserving budget slots for a galaxy with no
 *    arm seeds to sample would be pure dead capacity.
 *  - barDust: `floor(9000*dust/g^2)` when the barred bar has nonzero length
 *    (barDust.ts:20) — gated on the bar geometry rather than `category`
 *    directly, mirroring `buildBarDust`'s own `barLength > 0` guard.
 *  - lenticularNucDust: `floor(12000*dust/g^2)` for lenticular galaxies
 *    (lenticularDust.ts:32), independent of the ring gate below.
 *  - lenticularRingDust: `floor(34000*dustRingStrength/g^2)` for lenticular
 *    galaxies, only when `dustRingStrength > 0` (lenticularDust.ts:55) — a
 *    Sombrero-style ring is driven by its own strength knob, not `dust`.
 *  - irregularDust: `floor(16000*dust/g^2)` for irregular galaxies with a
 *    nonzero clump budget (irregularDust.ts:21), the same resample-to-budget
 *    and `armStarCount > 0` gate as armDust above (the clump seeds live in the
 *    irregularClumps star range, sized by `armStarCount`).
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
      (category === 'spiral' || category === 'barred') && budget.armStarCount > 0
        ? Math.floor((30000 * (params.dust ?? 1)) / (g * g))
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
      category === 'irregular' && budget.armStarCount > 0
        ? Math.floor((16000 * (params.dust ?? 1)) / (g * g))
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
