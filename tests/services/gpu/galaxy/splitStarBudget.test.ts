/**
 * splitStarBudget — divides the total star budget across bulge/disk/arm/halo
 * populations per galaxy category, extracted from galaxy-model.js:89-116.
 * Each family puts its stars in different structural components; see the
 * module header on the implementation for the per-category formulas.
 */
import { describe, expect, it } from 'vitest';
import { splitStarBudget } from '../../../../src/services/gpu/galaxy/splitStarBudget';
import type { GalaxyCategory } from '../../../../src/@types/galaxy/GalaxyCategory';

const CATEGORIES: readonly GalaxyCategory[] = [
  'elliptical',
  'lenticular',
  'irregular',
  'barred',
  'spiral',
];

describe('splitStarBudget', () => {
  it('counts sum to exactly totalStars for every category', () => {
    for (const category of CATEGORIES) {
      const budget = splitStarBudget(category, { type: 'Sb', starCount: 400000 });
      expect(budget.bulgeCount + budget.diskCount + budget.armStarCount + budget.haloCount).toBe(
        budget.totalStars,
      );
    }
  });

  it('totalStars floors at 20000', () => {
    const budget = splitStarBudget('spiral', { type: 'Sb', starCount: 100 });
    expect(budget.totalStars).toBe(20000);
  });

  it('elliptical has zero disk and arm stars', () => {
    const budget = splitStarBudget('elliptical', { type: 'E0', starCount: 400000 });
    expect(budget.diskCount).toBe(0);
    expect(budget.armStarCount).toBe(0);
    expect(budget.bulgeCount).toBe(Math.floor(400000 * 0.9));
  });

  it('irregular has zero smooth-disk stars', () => {
    const budget = splitStarBudget('irregular', { type: 'Irr', starCount: 400000 });
    expect(budget.diskCount).toBe(0);
    expect(budget.bulgeCount).toBe(Math.floor(400000 * 0.06));
    expect(budget.armStarCount).toBe(Math.floor(400000 * 0.86));
  });

  it('lenticular has zero arm stars', () => {
    const budget = splitStarBudget('lenticular', { type: 'S0', starCount: 400000 });
    expect(budget.armStarCount).toBe(0);
    expect(budget.bulgeCount).toBe(Math.floor(400000 * 0.55));
    expect(budget.diskCount).toBe(Math.floor(400000 * 0.4));
  });

  it('spiral arm share scales with armStrength — armStrength 0 gives zero arm stars', () => {
    const budget = splitStarBudget('spiral', {
      type: 'Sb',
      starCount: 400000,
      armStrength: 0,
    });
    expect(budget.armStarCount).toBe(0);
  });

  it('spiral arm star count grows with armStrength', () => {
    const low = splitStarBudget('spiral', { type: 'Sb', starCount: 400000, armStrength: 0.2 });
    const high = splitStarBudget('spiral', { type: 'Sb', starCount: 400000, armStrength: 1 });
    expect(high.armStarCount).toBeGreaterThan(low.armStarCount);
  });

  it('barred bulge fraction is 0.8x the spiral one for identical params', () => {
    const params = { type: 'Sb', starCount: 400000, bulgeSize: 1 };
    const spiral = splitStarBudget('spiral', params);
    const barred = splitStarBudget('barred', params);
    // bulgeFraction = 0.12 + 0.35 * bulgeSize * (barred ? 0.8 : 1), both below the 0.55 cap.
    const spiralFraction = 0.12 + 0.35 * 1;
    const barredFraction = 0.12 + 0.35 * 1 * 0.8;
    expect(spiral.bulgeCount).toBe(Math.floor(400000 * spiralFraction));
    expect(barred.bulgeCount).toBe(Math.floor(400000 * barredFraction));
  });

  it('spiral/barred halo is always zero', () => {
    const spiral = splitStarBudget('spiral', { type: 'Sb', starCount: 400000 });
    const barred = splitStarBudget('barred', { type: 'SBb', starCount: 400000 });
    expect(spiral.haloCount).toBe(0);
    expect(barred.haloCount).toBe(0);
  });

  it('bulgeSize 0 falls back to 1 (spike falsy-fallback semantics)', () => {
    const paramsWithZero = { type: 'Sc', starCount: 400000, bulgeSize: 0 };
    const paramsWithOne = { type: 'Sc', starCount: 400000, bulgeSize: 1 };
    const budgetWithZero = splitStarBudget('spiral', paramsWithZero);
    const budgetWithOne = splitStarBudget('spiral', paramsWithOne);
    expect(budgetWithZero).toEqual(budgetWithOne);
  });
});
