/**
 * carveDustLayout — table-driven CPU-side slot carving for the dust
 * populations the generation compute shaders draw, turned into a
 * `GenerationLayout` a GPU compute pass can dispatch against. Expected
 * iteration counts are derived from the same budget formulas
 * `carveDustLayout.ts` carries (see its docblock), scaled by `grainScale`,
 * so these tests track the carve function's actual budgets rather than a
 * frozen snapshot of them.
 */
import { describe, expect, it } from 'vitest';
import { carveDustLayout } from '../../../../../src/services/engine/galaxyGenerator/v1/carveDustLayout';
import { splitStarBudget } from '../../../../../src/services/engine/galaxyGenerator/v1/splitStarBudget';
import { grainScale } from '../../../../../src/services/engine/galaxyGenerator/v1/grainScale';
import { POPULATION_IDS } from '../../../../../src/services/engine/galaxyGenerator/shared/populationIds';
import type { GalaxyCategory } from '../../../../../src/@types/galaxy/GalaxyCategory';
import type { GalaxyParams } from '../../../../../src/@types/galaxy/GalaxyParams';

describe('carveDustLayout', () => {
  it('Sc default params: armDust iterations = floor(30000*spriteDust/grainScale^2) (the budget, not the candidate cap)', () => {
    const category: GalaxyCategory = 'spiral';
    const params: GalaxyParams = { type: 'Sc', starCount: 400000 };
    const budget = splitStarBudget(category, params);
    const layout = carveDustLayout(category, params, budget);

    const g = grainScale(budget.totalStars);
    const dustAmount = params.spriteDust ?? 1;
    // Resample-to-budget: one output slot per budgeted particle, no min() cap
    // against armStarCount — the GPU resamples the candidate space per slot.
    const expected = Math.floor((30000 * dustAmount) / (g * g));

    const armDust = layout.ranges.find((r) => r.popId === POPULATION_IDS.armDust)!;
    expect(armDust).toBeDefined();
    expect(armDust.iterations).toBe(expected);
  });

  it('armDust is gated on armStarCount > 0: armStrength 0 leaves a spiral with no dust ranges', () => {
    const category: GalaxyCategory = 'spiral';
    const params: GalaxyParams = { type: 'Sc', starCount: 400000, armStrength: 0 };
    const budget = splitStarBudget(category, params);
    expect(budget.armStarCount).toBe(0);

    const layout = carveDustLayout(category, params, budget);
    expect(layout.ranges.some((r) => r.popId === POPULATION_IDS.armDust)).toBe(false);
  });

  it('elliptical or spriteDust 0 gives an empty layout with capacity 0', () => {
    const paramsZeroDust: GalaxyParams = { type: 'Sc', starCount: 400000, spriteDust: 0 };
    const budgetZeroDust = splitStarBudget('spiral', paramsZeroDust);
    expect(carveDustLayout('spiral', paramsZeroDust, budgetZeroDust)).toEqual({
      ranges: [],
      capacity: 0,
    });

    const paramsElliptical: GalaxyParams = { type: 'E3', starCount: 400000 };
    const budgetElliptical = splitStarBudget('elliptical', paramsElliptical);
    expect(carveDustLayout('elliptical', paramsElliptical, budgetElliptical)).toEqual({
      ranges: [],
      capacity: 0,
    });
  });

  it('S0 with dustRingStrength 0 has only the nuclear range', () => {
    const category: GalaxyCategory = 'lenticular';
    const params: GalaxyParams = { type: 'S0', starCount: 400000, dustRingStrength: 0 };
    const budget = splitStarBudget(category, params);
    const layout = carveDustLayout(category, params, budget);

    expect(layout.ranges.map((r) => r.popId)).toEqual([POPULATION_IDS.lenticularNucDust]);
  });

  it('S0 with dustRingStrength 0.5 adds the ring range with floor(34000*0.5/g^2) iterations', () => {
    const category: GalaxyCategory = 'lenticular';
    const params: GalaxyParams = { type: 'S0', starCount: 400000, dustRingStrength: 0.5 };
    const budget = splitStarBudget(category, params);
    const layout = carveDustLayout(category, params, budget);

    const g = grainScale(budget.totalStars);
    expect(layout.ranges.map((r) => r.popId)).toEqual([
      POPULATION_IDS.lenticularNucDust,
      POPULATION_IDS.lenticularRingDust,
    ]);

    const ring = layout.ranges.find((r) => r.popId === POPULATION_IDS.lenticularRingDust)!;
    expect(ring.iterations).toBe(Math.floor((34000 * 0.5) / (g * g)));
  });

  it('SBb has armDust then barDust', () => {
    const category: GalaxyCategory = 'barred';
    const params: GalaxyParams = { type: 'SBb', starCount: 400000 };
    const budget = splitStarBudget(category, params);
    const layout = carveDustLayout(category, params, budget);

    expect(layout.ranges.map((r) => r.popId)).toEqual([
      POPULATION_IDS.armDust,
      POPULATION_IDS.barDust,
    ]);
  });

  it('Irr has only irregularDust sized to floor(16000*spriteDust/g^2) (budget, not the candidate cap)', () => {
    const category: GalaxyCategory = 'irregular';
    const params: GalaxyParams = { type: 'Irr', starCount: 400000 };
    const budget = splitStarBudget(category, params);
    const layout = carveDustLayout(category, params, budget);

    const g = grainScale(budget.totalStars);
    const dustAmount = params.spriteDust ?? 1;
    // Resample-to-budget: the full budget, not min(armStarCount, budget).
    const expected = Math.floor((16000 * dustAmount) / (g * g));

    expect(layout.ranges.map((r) => r.popId)).toEqual([POPULATION_IDS.irregularDust]);
    expect(layout.ranges[0]!.iterations).toBe(expected);
  });
});
