/**
 * armSpurParticleCloud's own geometric contract, which
 * `galaxyFieldFluxLedger.test.ts` doesn't reach: every sprite it places
 * actually sits near a spur's own ridge curve, not off in space (the risk a
 * wrong `logR`/frame lookup would create). Flux conservation itself is
 * covered by the ledger test — this file doesn't restate it.
 */
import { describe, expect, it } from 'vitest';
import { describeGalaxy } from '../../../../../src/services/engine/galaxyGenerator/shared/describeGalaxy';
import { armRidgeCurvePoint } from '../../../../../src/services/engine/galaxyGenerator/v2/armRidgeGeometry';
import { buildArmSpurs } from '../../../../../src/services/engine/galaxyGenerator/v2/armSpurGeometry';
import {
  buildArmSpurParticleCloud,
  deriveArmSpurCloudCount,
} from '../../../../../src/services/engine/galaxyGenerator/v2/armSpurParticleCloud';
import { DEFAULT_GALAXY_FIELD_TUNING } from '../../../../../src/services/engine/galaxyGenerator/v2/galaxyFieldMixture';
import type { GalaxyParams } from '../../../../../src/@types/galaxy/GalaxyParams';

const PARAMS: GalaxyParams = {
  type: 'Sb',
  shared: { seed: 42, armCount: 2 },
  legacy: { starCount: 100000 },
};

function distance3(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
}

/** Closest a fine sample of ONE spur's own curve comes to `point`. */
function nearestOnCurve(
  point: readonly number[],
  spur: Parameters<typeof armRidgeCurvePoint>[2],
  geometry: Parameters<typeof armRidgeCurvePoint>[1],
): number {
  const logStart = spur.spanStartLogR;
  const logEnd = Math.log(spur.fadeRadius / geometry.armStartRadius);
  let best = Infinity;
  const samples = 40;
  for (let i = 0; i <= samples; i++) {
    const logR = logStart + ((logEnd - logStart) * i) / samples;
    const curvePoint = armRidgeCurvePoint(logR, geometry, spur);
    best = Math.min(best, distance3(point, curvePoint));
  }
  return best;
}

describe('buildArmSpurParticleCloud', () => {
  const geometry = describeGalaxy(PARAMS);
  const tuning = DEFAULT_GALAXY_FIELD_TUNING;
  const spurArms = buildArmSpurs(geometry, tuning.arms.spurs, geometry.seed);

  it('places components only when there is flux and at least one spur', () => {
    expect(buildArmSpurParticleCloud(geometry, [], tuning, 100, geometry.seed)).toEqual([]);
    expect(buildArmSpurParticleCloud(geometry, spurArms, tuning, 0, geometry.seed)).toEqual([]);
  });

  it('every sprite sits near SOME spur curve, not off in space', () => {
    expect(spurArms.length).toBeGreaterThan(0);
    const count = deriveArmSpurCloudCount(spurArms, geometry, tuning);
    expect(count).toBeGreaterThan(0);

    const components = buildArmSpurParticleCloud(geometry, spurArms, tuning, 500, geometry.seed);
    expect(components.length).toBe(count);

    for (const component of components) {
      const distances = spurArms.map((spur) => nearestOnCurve(component.center, spur, geometry));
      const closest = Math.min(...distances);
      // Bounded by a handful of the sprite's own extent — a sprite scattered
      // off its lane by construction (armCrossSigma-scaled offset) still sits
      // within a small multiple of the arm's local width, never disc-scale
      // distances away.
      expect(closest).toBeLessThan(component.boundRadius * 6 + geometry.diskScaleLen * 0.05);
    }
  });

  it('is deterministic for a fixed seed', () => {
    const a = buildArmSpurParticleCloud(geometry, spurArms, tuning, 500, geometry.seed);
    const b = buildArmSpurParticleCloud(geometry, spurArms, tuning, 500, geometry.seed);
    expect(a).toEqual(b);
  });
});
