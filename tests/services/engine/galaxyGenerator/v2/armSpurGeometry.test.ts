/**
 * deriveArmSpurs' two load-bearing geometric contracts: roots walk outward
 * along the parent arm at roughly the jittered spacing law (not clustered,
 * not unbounded), and each root's curve is EXACTLY continuous with the
 * parent's at that root — the whole point of `spanStartLogR` being per-arm
 * rather than the old global `ARM_SPAN_START_FRAC`.
 */
import { describe, expect, it } from 'vitest';
import { describeGalaxy } from '../../../../../src/services/engine/galaxyGenerator/shared/describeGalaxy';
import {
  armRidgeAngle,
  armRidgeCurvePoint,
} from '../../../../../src/services/engine/galaxyGenerator/v2/armRidgeGeometry';
import {
  buildArmSpurs,
  deriveArmSpurs,
  spurRootSpacing,
} from '../../../../../src/services/engine/galaxyGenerator/v2/armSpurGeometry';
import { DEFAULT_GALAXY_FIELD_TUNING } from '../../../../../src/services/engine/galaxyGenerator/v2/galaxyFieldMixture';
import { mulberry32 } from '../../../../../src/utils/random/mulberry32';
import type { GalaxyParams } from '../../../../../src/@types/galaxy/GalaxyParams';

const PARAMS: GalaxyParams = {
  type: 'Sb',
  shared: { seed: 42, armCount: 2 },
  legacy: { starCount: 100000 },
};

function distance3(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
}

describe('deriveArmSpurs', () => {
  const geometry = describeGalaxy(PARAMS);
  const arm = geometry.arms[0]!;
  const tuning = DEFAULT_GALAXY_FIELD_TUNING.arms.spurs;

  it('drops roots in increasing logR, spaced roughly at the jittered spacing law', () => {
    const spurs = deriveArmSpurs(arm, geometry, tuning, mulberry32(1));
    // A vacuous pass (0 or 1 spur) would defeat the gap check below — the arm
    // has to actually produce a comb for this test to mean anything.
    expect(spurs.length).toBeGreaterThan(2);

    let prevLogR = arm.spanStartLogR;
    for (const spur of spurs) {
      expect(spur.spanStartLogR).toBeGreaterThan(prevLogR);

      const prevPoint = armRidgeCurvePoint(prevLogR, geometry, arm);
      const point = armRidgeCurvePoint(spur.spanStartLogR, geometry, arm);
      const gap = distance3(prevPoint, point);

      // The renewal-process bound: the walk targets `spurRootSpacing` at the
      // PREVIOUS root's radius, jittered by +-`tuning.jitter`, and can only
      // overshoot by one walk step's own arc length (a small fraction of one
      // spacing interval on this preset) — so the measured gap sits close to
      // that jittered target, evaluated at both ends of the interval since
      // the law itself grows with radius across the gap.
      const prevRadius = geometry.armStartRadius * Math.exp(prevLogR);
      const radius = geometry.armStartRadius * Math.exp(spur.spanStartLogR);
      const loNominal = spurRootSpacing(prevRadius, geometry, tuning) * (1 - tuning.jitter);
      const hiNominal = spurRootSpacing(radius, geometry, tuning) * (1 + tuning.jitter);
      expect(gap).toBeGreaterThan(loNominal * 0.5);
      expect(gap).toBeLessThan(hiNominal * 1.5);

      prevLogR = spur.spanStartLogR;
    }
  });

  it('is exactly continuous with the parent arm at each root (angle and curve point)', () => {
    const spurs = deriveArmSpurs(arm, geometry, tuning, mulberry32(1));
    expect(spurs.length).toBeGreaterThan(0);

    for (const spur of spurs) {
      const parentAngle = armRidgeAngle(spur.spanStartLogR, geometry, arm);
      const spurAngle = armRidgeAngle(spur.spanStartLogR, geometry, spur);
      expect(Math.abs(spurAngle - parentAngle)).toBeLessThan(1e-9);

      const parentPoint = armRidgeCurvePoint(spur.spanStartLogR, geometry, arm);
      const spurPoint = armRidgeCurvePoint(spur.spanStartLogR, geometry, spur);
      expect(distance3(parentPoint, spurPoint)).toBeLessThan(1e-9);

      // The steering knob actually steers, and in the OPENING direction: a
      // spur's d(angle)/d(logR) is the parent's own DIVIDED by pitchRatio
      // (smaller coefficient = more open/radial), not multiplied into a
      // tighter wrap that hugs the ridge.
      expect(spur.pitch).toBeCloseTo(arm.pitch / tuning.pitchRatio, 12);
    }
  });

  it('produces no spurs on a zeroed (armless-category) arm record', () => {
    const noArms = describeGalaxy({ type: 'E1', shared: {}, legacy: { starCount: 100000 } });
    expect(noArms.arms.length).toBeGreaterThan(0); // zeroed, not empty — see describeGalaxy's ZERO_ARM
    const spurs = deriveArmSpurs(noArms.arms[0]!, noArms, tuning, mulberry32(1));
    expect(spurs).toEqual([]);
  });
});

describe('buildArmSpurs', () => {
  const geometry = describeGalaxy(PARAMS);
  const tuning = DEFAULT_GALAXY_FIELD_TUNING.arms.spurs;

  it('is empty when the pill is off', () => {
    expect(buildArmSpurs(geometry, { ...tuning, enabled: false }, geometry.seed)).toEqual([]);
  });

  it('is deterministic for a fixed seed', () => {
    const a = buildArmSpurs(geometry, tuning, 999);
    const b = buildArmSpurs(geometry, tuning, 999);
    expect(a).toEqual(b);
  });
});
