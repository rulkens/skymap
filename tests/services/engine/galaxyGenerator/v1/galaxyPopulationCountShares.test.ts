/**
 * galaxyPopulationCountShares — the shares the sprite tier spends its budget
 * by. `splitStarBudget`'s own "counts sum to totalStars" test cannot catch a
 * mistyped share, because the last population absorbs whatever rounding (or a
 * typo) left over.
 *
 * The round trip below is the folder boundary itself: `shared/` decides how
 * much LIGHT each population has, v1 divides by what one of its sprites emits
 * to get a count, and the only thing saying that division inverts is this test.
 */
import { describe, expect, it } from 'vitest';
import { carveStarLayout } from '../../../../../src/services/engine/galaxyGenerator/v1/carveStarLayout';
import { classifyHubbleType } from '../../../../../src/services/engine/galaxyGenerator/shared/classifyHubbleType';
import { describeGalaxy } from '../../../../../src/services/engine/galaxyGenerator/shared/describeGalaxy';
import { galaxyPopulationCountShares } from '../../../../../src/services/engine/galaxyGenerator/v1/galaxyPopulationCountShares';
import { POPULATION_IDS } from '../../../../../src/services/engine/galaxyGenerator/shared/populationIds';
import { SPRITE_POPULATION_BRIGHTNESS } from '../../../../../src/services/engine/galaxyGenerator/v1/spritePopulationBrightness';
import { splitStarBudget } from '../../../../../src/services/engine/galaxyGenerator/v1/splitStarBudget';
import type { GalaxyCategory } from '../../../../../src/@types/galaxy/GalaxyCategory';
import type { GalaxyParams } from '../../../../../src/@types/galaxy/GalaxyParams';

const CATEGORIES: readonly GalaxyCategory[] = [
  'elliptical',
  'lenticular',
  'irregular',
  'barred',
  'spiral',
];

// Off-default bulge/arm knobs, so the spiral-like entry is exercised where its
// terms actually differ rather than at the fallbacks.
const PARAMS: readonly GalaxyParams[] = [
  { type: 'Sb' },
  { type: 'Sb', bulgeSize: 0.45, armStrength: 1.4 },
  { type: 'Sb', bulgeSize: 1.8, armStrength: 0.2 },
];

/** One galaxy per category, each with a bar/arm mix that makes all four shares differ. */
const BY_CATEGORY: readonly GalaxyParams[] = [
  { type: 'E1', starCount: 100000 },
  { type: 'S0', starCount: 100000 },
  { type: 'Sb', starCount: 100000, bulgeSize: 0.6, armStrength: 1.1 },
  { type: 'SBb', starCount: 100000, bulgeSize: 0.45, armStrength: 0.8 },
  { type: 'Irr', starCount: 100000 },
];

describe('galaxyPopulationCountShares', () => {
  it.each(CATEGORIES)('shares of a %s galaxy sum to the whole', (category) => {
    for (const params of PARAMS) {
      const f = galaxyPopulationCountShares(category, params);
      expect(f.bulge + f.bar + f.disk + f.arm + f.halo).toBeCloseTo(1, 12);
    }
  });

  // The inversion, closed: what the GPU will actually draw, weighted by what
  // one of its stars emits, has to come back to the light the analytic field
  // renders. Fails on a lost population, a lane read at the wrong brightness,
  // or `carveStarLayout` and the split disagreeing about who holds the bar.
  const LANE_OF_POPULATION: Readonly<Record<number, keyof typeof SPRITE_POPULATION_BRIGHTNESS>> = {
    [POPULATION_IDS.bulge]: 'bulge',
    [POPULATION_IDS.bar]: 'bar',
    [POPULATION_IDS.disk]: 'disk',
    [POPULATION_IDS.spiralArms]: 'arm',
    [POPULATION_IDS.irregularClumps]: 'irregularClump',
    [POPULATION_IDS.halo]: 'halo',
  };

  it.each(BY_CATEGORY)('carves $type sprites back into its own light split', (params) => {
    const category = classifyHubbleType(params.type);
    const budget = splitStarBudget(category, params);
    const layout = carveStarLayout(category, params, budget);
    const emitted = { bulge: 0, bar: 0, disc: 0, halo: 0 };
    for (const range of layout.ranges) {
      const lane = LANE_OF_POPULATION[range.popId];
      if (lane === undefined) continue; // globular stars sit outside the split
      const light = range.iterations * SPRITE_POPULATION_BRIGHTNESS[lane];
      if (lane === 'bulge' || lane === 'bar' || lane === 'halo') emitted[lane] += light;
      else emitted.disc += light; // disk, arms and clumps are all disc light
    }
    const total = emitted.bulge + emitted.bar + emitted.disc + emitted.halo;
    const light = describeGalaxy(params).light;
    // Quantisation only: five populations, at most one star each, against a
    // 100 000-star budget.
    for (const lane of ['bulge', 'bar', 'disc', 'halo'] as const) {
      expect(emitted[lane] / total).toBeCloseTo(light[lane], 4);
    }
  });
});
