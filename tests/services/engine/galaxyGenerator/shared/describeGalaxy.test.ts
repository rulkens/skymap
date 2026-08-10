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
import {
  ARM_SPAN_START_FRAC,
  armRidgeCurvePoint,
} from '../../../../../src/services/engine/galaxyGenerator/v2/armRidgeGeometry';
import type { GalaxyParams } from '../../../../../src/@types/galaxy/GalaxyParams';

/**
 * Every drawn field, at full precision. Deliberately a hash over fixed presets
 * rather than over the gallery, so tuning a reference galaxy leaves it alone
 * and only a change to the draw sequence itself moves it.
 */
function drawDigest(params: GalaxyParams): string {
  const d = describeGalaxy({
    ...params,
    shared: { ...params.shared, seed: 12345, asymSeed: 7, clumpSeed: 8, waveSeed: 9 },
  });
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
    expect(drawDigest({ type, shared: {}, legacy: { starCount: 100000 } })).toBe(expected);
  });

  // A spiral at armStrength 0 still HAS arms; it just spends no sprites on
  // them. v2 reads these records and nothing else in the suite would notice
  // them going to zero.
  it.each(['Sb', 'SBb'])('%s keeps its arms when no stars are budgeted for them', (type) => {
    const params: GalaxyParams = { type, shared: {}, legacy: { starCount: 100000 } };
    expect(
      describeGalaxy({ ...params, legacy: { ...params.legacy, armStrength: 0 } }).arms,
    ).toEqual(describeGalaxy({ ...params, legacy: { ...params.legacy, armStrength: 1 } }).arms);
  });

  // describeGalaxy.ts duplicates ARM_SPAN_START_FRAC rather than importing it
  // (shared/ must gain no import edge onto v2/ — see that file's own comment)
  // — this is the guard that keeps the duplicate from drifting silently.
  it('an ordinary arm defaults spanStartLogR to log(v2 ARM_SPAN_START_FRAC)', () => {
    const geometry = describeGalaxy({ type: 'Sb', shared: {}, legacy: { starCount: 100000 } });
    for (const arm of geometry.arms) {
      expect(arm.spanStartLogR).toBeCloseTo(Math.log(ARM_SPAN_START_FRAC), 15);
    }
  });

  // The complement: the three armless categories. `numArms` is clamped to at
  // least 1 for every galaxy, so only the category keeps their records zeroed.
  it.each(['E1', 'S0', 'Irr'])('%s has no arms whatever its arm knobs say', (type) => {
    const arms = describeGalaxy({
      type,
      shared: { armCount: 4 },
      legacy: { starCount: 100000, armStrength: 1.5 },
    }).arms;
    expect(arms.map((arm) => arm.weight)).toEqual(arms.map(() => 0));
  });

  // armStart is a pure multiplier on armStartRadius applied after the
  // existing max(...) derivation, so it must scale linearly. Every other draw
  // (which never reads params.shared.armStart) is untouched EXCEPT the four
  // phase-like arm terms whose logR coefficient is nonzero (phase, via its
  // own arm's pitch; meanderPhase; waveP1; waveP2) — describeGalaxy adds
  // coefficient * log(armStart) to each so the curve through space stays
  // fixed (see describeGalaxy.ts's armStartLogCompensation).
  it('armStart scales armStartRadius and compensates the phase-like arm terms, leaving the rest alone', () => {
    const params: GalaxyParams = {
      type: 'Sb',
      shared: { seed: 42 },
      legacy: { starCount: 100000 },
    };
    const base = describeGalaxy(params);
    const m = 0.5;
    const halved = describeGalaxy({ ...params, shared: { ...params.shared, armStart: m } });
    expect(halved.armStartRadius).toBeCloseTo(base.armStartRadius * m);

    const logM = Math.log(m);
    const compensatedArms = base.arms.map((arm) => ({
      ...arm,
      phase: arm.phase + arm.pitch * logM,
      meanderPhase: arm.meanderPhase + 2 * arm.meanderFreq * logM,
      waveP1: arm.waveP1 + arm.waveF1 * logM,
      waveP2: arm.waveP2 + arm.waveF2 * logM,
    }));
    halved.arms.forEach((arm, i) => {
      const expected = compensatedArms[i]!;
      expect(arm.phase).toBeCloseTo(expected.phase, 12);
      expect(arm.meanderPhase).toBeCloseTo(expected.meanderPhase, 12);
      expect(arm.waveP1).toBeCloseTo(expected.waveP1, 12);
      expect(arm.waveP2).toBeCloseTo(expected.waveP2, 12);
    });
    expect({ ...halved, armStartRadius: base.armStartRadius, arms: base.arms }).toEqual(base);
  });

  it('an absent armStart is identical to armStart 1', () => {
    const params: GalaxyParams = {
      type: 'SBb',
      shared: { seed: 7 },
      legacy: { starCount: 100000 },
    };
    expect(describeGalaxy(params)).toEqual(
      describeGalaxy({ ...params, shared: { ...params.shared, armStart: 1 } }),
    );
  });

  // Guards against armStartRadius alone parameterizing logR: scaling it by
  // armStart would then rotate the whole log-spiral pattern rigidly (angle at
  // a fixed physical radius shifting by -pitch*log(armStart)). irregularity 0
  // zeroes meanderAmp and armWave defaults to 0, so armRidgeAngle reduces to
  // the pure log-spiral term describeGalaxy's compensation targets — no
  // second-order meander/wave drift to launder the assertion.
  it('armStart does not rotate the arm pattern: a fixed physical radius maps to the same point', () => {
    const params: GalaxyParams = {
      type: 'Sb',
      shared: { seed: 42, irregularity: 0, armWave: 0 },
      legacy: { starCount: 100000 },
    };
    const base = describeGalaxy(params);
    const shifted = describeGalaxy({ ...params, shared: { ...params.shared, armStart: 1.4 } });

    const radius = Math.max(base.armStartRadius, shifted.armStartRadius) * 3;
    base.arms.forEach((arm, i) => {
      const pointBase = armRidgeCurvePoint(Math.log(radius / base.armStartRadius), base, arm);
      const pointShifted = armRidgeCurvePoint(
        Math.log(radius / shifted.armStartRadius),
        shifted,
        shifted.arms[i]!,
      );
      expect(Math.abs(pointShifted[0] - pointBase[0])).toBeLessThan(1e-9);
      expect(Math.abs(pointShifted[2] - pointBase[2])).toBeLessThan(1e-9);
    });
  });
});
