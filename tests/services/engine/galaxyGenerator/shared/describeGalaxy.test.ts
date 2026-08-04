/**
 * describeGalaxy owns every construction-time RNG draw a galaxy has, and the
 * order it consumes them in is the contract every seeded preset is pinned to.
 * Nothing else in the suite would notice a draw moving: the packer's
 * stream-isolation tests catch a value leaking BETWEEN streams, not a reorder
 * within one.
 *
 * The other tests pin the seam to the sprite tier — the sprite counts are
 * DERIVED from the light split and no type says the round trip closes; and the
 * arm gate, which must stay a category, because a star budget deciding it
 * strips the analytic field's arm ridges, SF events and HII regions along with
 * the sprites.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { carveStarLayout } from '../../../../../src/services/engine/galaxyGenerator/v1/carveStarLayout';
import { classifyHubbleType } from '../../../../../src/services/engine/galaxyGenerator/shared/classifyHubbleType';
import { describeGalaxy } from '../../../../../src/services/engine/galaxyGenerator/shared/describeGalaxy';
import { POPULATION_IDS } from '../../../../../src/services/engine/galaxyGenerator/shared/populationIds';
import { SPRITE_POPULATION_BRIGHTNESS } from '../../../../../src/services/engine/galaxyGenerator/shared/spritePopulationBrightness';
import { splitStarBudget } from '../../../../../src/services/engine/galaxyGenerator/v1/splitStarBudget';
import type { GalaxyParams } from '../../../../../src/@types/galaxy/GalaxyParams';

/** One galaxy per category, each with a bar/arm mix that makes all four shares differ. */
const BY_CATEGORY: readonly GalaxyParams[] = [
  { type: 'E1', starCount: 100000 },
  { type: 'S0', starCount: 100000 },
  { type: 'Sb', starCount: 100000, bulgeSize: 0.6, armStrength: 1.1 },
  { type: 'SBb', starCount: 100000, bulgeSize: 0.45, armStrength: 0.8 },
  { type: 'Irr', starCount: 100000 },
];

/**
 * Every drawn field, at full precision. Deliberately a hash over fixed presets
 * rather than over the gallery, so tuning a reference galaxy leaves it alone
 * and only a change to the draw sequence itself moves it.
 */
function drawDigest(params: GalaxyParams): string {
  const d = describeGalaxy({ ...params, seed: 12345, asymSeed: 7, clumpSeed: 8, waveSeed: 9 });
  const numbers = [
    d.lopsidedAmp,
    d.lopsidedAngle,
    d.bulgeAxisZ,
    d.bulgeTiltRad,
    d.barTiltRad,
    ...d.irregularClumpCenters.flat(),
    ...d.lenticularCloudCenters.flat(),
    ...d.arms.flatMap((arm) => [
      arm.phase,
      arm.pitch,
      arm.weight,
      arm.fadeRadius,
      arm.meanderAmp,
      arm.meanderFreq,
      arm.meanderPhase,
      arm.age,
      arm.clumpF1,
      arm.clumpP1,
      arm.clumpF2,
      arm.clumpP2,
      arm.waveF1,
      arm.waveP1,
      arm.waveF2,
      arm.waveP2,
    ]),
  ];
  return createHash('sha256')
    .update(numbers.map((n) => n.toExponential(15)).join(','))
    .digest('hex')
    .slice(0, 16);
}

describe('describeGalaxy', () => {
  // Blessing a new hash here means every seeded galaxy and every gallery preset
  // has just been rerolled. That is occasionally the intent; it is never a
  // side effect worth accepting silently.
  // Four sequences, not five: a barred galaxy draws exactly what an unbarred
  // one does (its bar LENGTH is a formula, only the tilt is a draw).
  it.each([
    ['E1', 'b1c51aa8506bbaf8'], // asymmetry + bar tilt only
    ['S0', 'd5a0e55f35c40ef5'], // + 34 lenticular cloud centres
    ['Sb', 'aa1c8b59215135df'], // + per-arm personality off three streams
    ['Irr', '3f2ca294135c02d9'], // + 7 clump centres, no arms
  ])('draws %s in the pinned order', (type, expected) => {
    expect(drawDigest({ type, starCount: 100000 })).toBe(expected);
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

  // A spiral at armStrength 0 still HAS arms; it just spends no sprites on
  // them. v2 reads these records and nothing else in the suite would notice
  // them going to zero.
  it.each(['Sb', 'SBb'])('%s keeps its arms when no stars are budgeted for them', (type) => {
    const params = { type, starCount: 100000 };
    expect(describeGalaxy({ ...params, armStrength: 0 }).arms).toEqual(
      describeGalaxy({ ...params, armStrength: 1 }).arms,
    );
  });

  // The complement: the three armless categories. `numArms` is clamped to at
  // least 1 for every galaxy, so only the category keeps their records zeroed.
  it.each(['E1', 'S0', 'Irr'])('%s has no arms whatever its arm knobs say', (type) => {
    const arms = describeGalaxy({ type, starCount: 100000, armCount: 4, armStrength: 1.5 }).arms;
    expect(arms.map((arm) => arm.weight)).toEqual(arms.map(() => 0));
  });
});
