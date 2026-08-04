/**
 * describeGalaxy owns every construction-time RNG draw a galaxy has, and the
 * order it consumes them in is the contract every seeded preset is pinned to.
 * Nothing else in the suite would notice a draw moving: the packer's
 * stream-isolation tests catch a value leaking BETWEEN streams, not a reorder
 * within one.
 *
 * The other tests pin the arm gate, which must stay a category, because a star
 * budget deciding it strips the analytic field's arm ridges, SF events and HII
 * regions along with the sprites. What v1 then spends on that light is closed
 * by `v1/galaxyPopulationCountShares.test.ts`.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { describeGalaxy } from '../../../../../src/services/engine/galaxyGenerator/shared/describeGalaxy';
import type { GalaxyParams } from '../../../../../src/@types/galaxy/GalaxyParams';

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
