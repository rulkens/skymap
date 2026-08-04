/**
 * describeGalaxy owns every construction-time RNG draw a galaxy has, and the
 * order it consumes them in is the contract every seeded preset is pinned to.
 * Nothing else in the suite would notice a draw moving: the packer's
 * stream-isolation tests catch a value leaking BETWEEN streams, not a reorder
 * within one.
 *
 * The other two tests pin the seam to the sprite tier — the light split and the
 * flux anchor are read off the description but spent by `carveStarLayout`, and
 * no type says the two must agree.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { carveStarLayout } from '../../../../../src/services/engine/galaxyGenerator/shared/carveStarLayout';
import { classifyHubbleType } from '../../../../../src/services/engine/galaxyGenerator/shared/classifyHubbleType';
import { describeGalaxy } from '../../../../../src/services/engine/galaxyGenerator/shared/describeGalaxy';
import { POPULATION_IDS } from '../../../../../src/services/engine/galaxyGenerator/shared/populationIds';
import { splitStarBudget } from '../../../../../src/services/engine/galaxyGenerator/shared/splitStarBudget';
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

  it.each(BY_CATEGORY)('splits $type light as the carved star layout divides it', (params) => {
    const category = classifyHubbleType(params.type);
    const layout = carveStarLayout(category, params, splitStarBudget(category, params));
    const description = describeGalaxy(params);
    const iterations = (popId: number): number =>
      layout.ranges.find((range) => range.popId === popId)?.iterations ?? 0;
    const modelled = description.modelledStars;
    const carved = {
      bulge: iterations(POPULATION_IDS.bulge) / modelled,
      bar: iterations(POPULATION_IDS.bar) / modelled,
      halo: iterations(POPULATION_IDS.halo) / modelled,
      disc:
        (iterations(POPULATION_IDS.disk) +
          iterations(POPULATION_IDS.spiralArms) +
          iterations(POPULATION_IDS.irregularClumps)) /
        modelled,
    };
    // One star's worth of slack per share: the layout quantises, the light
    // split does not, and that difference is the whole point of them being
    // separate.
    const slack = 1 / modelled;
    expect(Math.abs(description.light.bulge - carved.bulge)).toBeLessThanOrEqual(slack);
    expect(Math.abs(description.light.bar - carved.bar)).toBeLessThanOrEqual(slack);
    expect(Math.abs(description.light.halo - carved.halo)).toBeLessThanOrEqual(slack);
    expect(Math.abs(description.light.disc - carved.disc)).toBeLessThanOrEqual(2 * slack);
  });

  // `modelledStars` is the flux-parity anchor, and it is only honest while the
  // carved layout really does spend the whole budget on modelled populations.
  it.each(BY_CATEGORY)('anchors $type flux to every star the layout carves', (params) => {
    const category = classifyHubbleType(params.type);
    const layout = carveStarLayout(category, params, splitStarBudget(category, params));
    const carved = layout.ranges
      .filter((range) => range.popId !== POPULATION_IDS.globularStar)
      .reduce((sum, range) => sum + range.iterations, 0);
    expect(describeGalaxy(params).modelledStars).toBe(carved);
  });
});
