/**
 * carveStarLayout — table-driven CPU-side slot carving for the star
 * populations the generation compute shaders draw, turned into a
 * `GenerationLayout` a GPU compute pass can dispatch against without any
 * per-invocation branching. Expected iteration counts are derived from
 * `splitStarBudget`'s formulas (not hardcoded numbers) so these tests track
 * the carve function's actual loop bounds rather than a frozen snapshot of
 * them — see `carveStarLayout.ts`'s docblock for the per-population bounds
 * this carving mirrors.
 */
import { describe, expect, it } from 'vitest';
import { carveStarLayout } from '../../../../../src/services/engine/galaxyGenerator/v1/carveStarLayout';
import { splitStarBudget } from '../../../../../src/services/engine/galaxyGenerator/v1/splitStarBudget';
import { POPULATION_IDS } from '../../../../../src/services/engine/galaxyGenerator/shared/populationIds';
import type { GalaxyCategory } from '../../../../../src/@types/galaxy/GalaxyCategory';
import type { GalaxyParams } from '../../../../../src/@types/galaxy/GalaxyParams';
import type { PopulationRange } from '../../../../../src/@types/galaxy/PopulationRange';

function sumSlots(ranges: readonly PopulationRange[]): number {
  return ranges.reduce((sum, r) => sum + r.iterations * r.stride, 0);
}

describe('carveStarLayout', () => {
  it('Sc: bulge, disk, arms ranges are contiguous with arms stride 5', () => {
    const category: GalaxyCategory = 'spiral';
    const params: GalaxyParams = { type: 'Sc', shared: {}, legacy: { starCount: 400000 } };
    const budget = splitStarBudget(category, params);
    const layout = carveStarLayout(category, params, budget);

    expect(layout.ranges.map((r) => r.popId)).toEqual([
      POPULATION_IDS.bulge,
      POPULATION_IDS.disk,
      POPULATION_IDS.spiralArms,
      POPULATION_IDS.halo,
    ]);

    let cursor = 0;
    for (const range of layout.ranges) {
      expect(range.start).toBe(cursor);
      cursor += range.iterations * range.stride;
    }

    const arms = layout.ranges.find((r) => r.popId === POPULATION_IDS.spiralArms)!;
    expect(arms.stride).toBe(5);
    expect(arms.iterations).toBe(budget.armStarCount);
  });

  it("SBb: the bar range is the budget's own bar count, and the disk keeps all of its", () => {
    const category: GalaxyCategory = 'barred';
    const params: GalaxyParams = { type: 'SBb', shared: {}, legacy: { starCount: 400000 } };
    const budget = splitStarBudget(category, params);
    const layout = carveStarLayout(category, params, budget);

    const bar = layout.ranges.find((r) => r.popId === POPULATION_IDS.bar)!;
    const disk = layout.ranges.find((r) => r.popId === POPULATION_IDS.disk)!;

    expect(bar.iterations).toBe(budget.barCount);
    expect(disk.iterations).toBe(budget.diskCount);
  });

  it('Irr: clumps range has stride 2 and there is no disk or arms range', () => {
    const category: GalaxyCategory = 'irregular';
    const params: GalaxyParams = { type: 'Irr', shared: {}, legacy: { starCount: 400000 } };
    const budget = splitStarBudget(category, params);
    const layout = carveStarLayout(category, params, budget);

    expect(layout.ranges.some((r) => r.popId === POPULATION_IDS.disk)).toBe(false);
    expect(layout.ranges.some((r) => r.popId === POPULATION_IDS.spiralArms)).toBe(false);

    const clumps = layout.ranges.find((r) => r.popId === POPULATION_IDS.irregularClumps)!;
    expect(clumps.stride).toBe(2);
    expect(clumps.iterations).toBe(budget.armStarCount);
  });

  it('E3: bulge and halo only', () => {
    const category: GalaxyCategory = 'elliptical';
    const params: GalaxyParams = { type: 'E3', shared: {}, legacy: { starCount: 400000 } };
    const budget = splitStarBudget(category, params);
    const layout = carveStarLayout(category, params, budget);

    expect(layout.ranges.map((r) => r.popId)).toEqual([POPULATION_IDS.bulge, POPULATION_IDS.halo]);
    const bulge = layout.ranges.find((r) => r.popId === POPULATION_IDS.bulge)!;
    const halo = layout.ranges.find((r) => r.popId === POPULATION_IDS.halo)!;
    expect(bulge.iterations).toBe(budget.bulgeCount);
    expect(halo.iterations).toBe(budget.haloCount);
  });

  it('globularCount 12 appends a 1080-slot globularStar range', () => {
    const category: GalaxyCategory = 'spiral';
    const params: GalaxyParams = {
      type: 'Sc',
      shared: {},
      legacy: { starCount: 400000, globularCount: 12 },
    };
    const budget = splitStarBudget(category, params);
    const layout = carveStarLayout(category, params, budget);

    expect(layout.ranges.some((r) => r.popId === POPULATION_IDS.globularCluster)).toBe(false);

    const gc = layout.ranges.find((r) => r.popId === POPULATION_IDS.globularStar);
    expect(gc).toBeDefined();
    expect(gc!.stride).toBe(1);
    expect(gc!.iterations).toBe(12 * 90);
    expect(gc!.iterations * gc!.stride).toBe(1080);
  });

  it('capacity equals the sum of iterations*stride', () => {
    const category: GalaxyCategory = 'barred';
    const params: GalaxyParams = {
      type: 'SBb',
      shared: {},
      legacy: { starCount: 400000, globularCount: 4 },
    };
    const budget = splitStarBudget(category, params);
    const layout = carveStarLayout(category, params, budget);

    expect(layout.capacity).toBe(sumSlots(layout.ranges));
  });
});
