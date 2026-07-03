/**
 * carveDustLayout — table-driven CPU-side slot carving for the dust
 * populations `generateGalaxy` draws, turned into a `GenerationLayout` a GPU
 * compute pass can dispatch against. Expected iteration counts are derived
 * from the same formulas the dust builders use (armDust.ts:26, barDust.ts:20,
 * lenticularDust.ts:32+55, irregularDust.ts:21), scaled by `grainScale`, so
 * these tests track the CPU model's actual budgets rather than a frozen
 * snapshot of them.
 */
import { describe, expect, it } from 'vitest';
import { carveDustLayout } from '../../../../tools/galaxy-renderer/src/model/carveDustLayout';
import { splitStarBudget } from '../../../../tools/galaxy-renderer/src/model/splitStarBudget';
import { grainScale } from '../../../../tools/galaxy-renderer/src/model/grainScale';
import { POPULATION_IDS } from '../../../../tools/galaxy-renderer/src/model/populationIds';
import type { GalaxyCategory } from '../../../../tools/galaxy-renderer/@types/model/GalaxyCategory';
import type { GalaxyParams } from '../../../../tools/galaxy-renderer/@types/model/GalaxyParams';

describe('carveDustLayout', () => {
  it('Sc default params: armDust iterations = min(armStarCount, floor(30000*dust/grainScale^2))', () => {
    const category: GalaxyCategory = 'spiral';
    const params: GalaxyParams = { type: 'Sc', starCount: 400000 };
    const budget = splitStarBudget(category, params);
    const layout = carveDustLayout(category, params, budget);

    const g = grainScale(budget.totalStars);
    const dustAmount = params.dust ?? 1;
    const expected = Math.min(budget.armStarCount, Math.floor((30000 * dustAmount) / (g * g)));

    const armDust = layout.ranges.find((r) => r.popId === POPULATION_IDS.armDust)!;
    expect(armDust).toBeDefined();
    expect(armDust.iterations).toBe(expected);
  });

  it('elliptical or dust 0 gives an empty layout with capacity 0', () => {
    const paramsZeroDust: GalaxyParams = { type: 'Sc', starCount: 400000, dust: 0 };
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

  it('Irr has only irregularDust capped at min(armStarCount, budget)', () => {
    const category: GalaxyCategory = 'irregular';
    const params: GalaxyParams = { type: 'Irr', starCount: 400000 };
    const budget = splitStarBudget(category, params);
    const layout = carveDustLayout(category, params, budget);

    const g = grainScale(budget.totalStars);
    const dustAmount = params.dust ?? 1;
    const expected = Math.min(budget.armStarCount, Math.floor((16000 * dustAmount) / (g * g)));

    expect(layout.ranges.map((r) => r.popId)).toEqual([POPULATION_IDS.irregularDust]);
    expect(layout.ranges[0]!.iterations).toBe(expected);
  });
});
