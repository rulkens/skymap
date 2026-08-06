/**
 * splitStarBudget — quantises `galaxyPopulationCountShares` into the integer
 * counts the sprite tier draws. What is worth pinning here is the quantiser's
 * own contract (the counts re-sum, a zero share stays exactly zero) and the
 * categories whose populations do not exist — a nonzero count for a population
 * the generator has no builder for carves a GPU range nothing fills. The
 * shares themselves are `galaxyPopulationCountShares`' business.
 */
import { describe, expect, it } from 'vitest';
import { splitStarBudget } from '../../../../../src/services/engine/galaxyGenerator/v1/splitStarBudget';
import type { GalaxyCategory } from '../../../../../src/@types/galaxy/GalaxyCategory';
import type { StarBudget } from '../../../../../src/@types/galaxy/StarBudget';

const CATEGORIES: readonly GalaxyCategory[] = [
  'elliptical',
  'lenticular',
  'irregular',
  'barred',
  'spiral',
];

function sumOfCounts(budget: StarBudget): number {
  return (
    budget.bulgeCount + budget.barCount + budget.diskCount + budget.armStarCount + budget.haloCount
  );
}

describe('splitStarBudget', () => {
  it('counts sum to exactly totalStars for every category', () => {
    for (const category of CATEGORIES) {
      const budget = splitStarBudget(category, {
        type: 'Sb',
        shared: {},
        legacy: { starCount: 400000 },
      });
      expect(sumOfCounts(budget)).toBe(budget.totalStars);
    }
  });

  it('totalStars floors at 20000', () => {
    const budget = splitStarBudget('spiral', {
      type: 'Sb',
      shared: {},
      legacy: { starCount: 100 },
    });
    expect(budget.totalStars).toBe(20000);
  });

  // Each row is a population the category's generator has no builder for.
  it.each([
    ['elliptical', 'E0', ['diskCount', 'armStarCount', 'barCount']],
    ['lenticular', 'S0', ['armStarCount', 'barCount']],
    ['irregular', 'Irr', ['diskCount', 'barCount']],
    ['spiral', 'Sb', ['barCount']],
  ] as const)('a %s spends no stars on populations it has none of', (category, type, empty) => {
    const budget = splitStarBudget(category, { type, shared: {}, legacy: { starCount: 400000 } });
    for (const key of empty) expect(budget[key]).toBe(0);
  });

  // The one param that still moves the sprite tier's arm/disc placement. At 0
  // the arm range disappears entirely, which `carveDustLayout` also keys off.
  it('armStrength 0 gives a spiral zero arm stars, and more gives more', () => {
    const params = { type: 'Sb', shared: {}, legacy: { starCount: 400000 } } as const;
    expect(
      splitStarBudget('spiral', { ...params, legacy: { ...params.legacy, armStrength: 0 } })
        .armStarCount,
    ).toBe(0);
    expect(
      splitStarBudget('spiral', { ...params, legacy: { ...params.legacy, armStrength: 1 } })
        .armStarCount,
    ).toBeGreaterThan(
      splitStarBudget('spiral', { ...params, legacy: { ...params.legacy, armStrength: 0.2 } })
        .armStarCount,
    );
  });

  // A barred preset whose bar has zero length builds no bar geometry, so it
  // must be lit and populated as having none — the decomposition's own gate,
  // seen from the sprite tier.
  it('a barred galaxy with barStrength 0 spends no stars on a bar', () => {
    const budget = splitStarBudget('barred', {
      type: 'SBb',
      shared: { barStrength: 0 },
      legacy: { starCount: 400000 },
    });
    expect(budget.barCount).toBe(0);
    expect(sumOfCounts(budget)).toBe(budget.totalStars);
  });
});
