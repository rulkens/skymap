/**
 * The bake this module does is expensive (O(rings x arms x az)) and gets
 * called twice per ISM-map rebuild (the fluid runner's own texture upload +
 * `galaxyIsmMapFluidEvents.ts`'s event draw) with geometry/tuning objects
 * that are byte-identical on every non-arm slider drag — the memo and the
 * windowed inner loop are both there to make that NOT repay the full bake.
 * Two things can break: the memo keying on the wrong thing (either missing
 * a real change, or thrashing on irrelevant ones), and the windowed loop
 * dropping real signal.
 */
import { describe, expect, it } from 'vitest';
import type { GalaxyDescription } from '../../../../../src/@types/galaxy/GalaxyDescription';
import type { GalaxyFieldTuning } from '../../../../../src/@types/galaxy/GalaxyFieldTuning';
import { MILKY_WAY_GALAXY_PARAMS } from '../../../../../src/data/milkyWay/milkyWayGalaxyParams';
import {
  armCrossSigma,
  armFadeEnvelope,
  armRidgeAngle,
  armRidgeCurvePoint,
} from '../../../../../src/services/engine/galaxyGenerator/v2/armRidgeGeometry';
import { buildArmSpurs } from '../../../../../src/services/engine/galaxyGenerator/v2/armSpurGeometry';
import { describeGalaxy } from '../../../../../src/services/engine/galaxyGenerator/shared/describeGalaxy';
import { DEFAULT_GALAXY_FIELD_TUNING } from '../../../../../src/services/engine/galaxyGenerator/v2/galaxyFieldMixture';
import {
  buildGalaxyIsmMapArmForcing,
  ISM_MAP_AZ,
  ISM_MAP_RINGS,
  ismMapGridRadius,
} from '../../../../../src/services/engine/galaxyGenerator/v2/galaxyIsmMapArmForcing';
import { ismMapRingIndexForRadius } from '../../../../../src/utils/galaxy/ismMapRingIndexForRadius';
import { ismMapRingRadius } from '../../../../../src/utils/galaxy/ismMapRingRadius';

/**
 * The pre-windowing algorithm: full az sweep, atan2(sin, cos) wrap. Computed
 * inline from the same shared ridge functions the module under test reads,
 * rather than depending on a private unwindowed path in the module itself.
 */
function referenceForcing(geometry: GalaxyDescription, tuning: GalaxyFieldTuning): Float32Array {
  const { rMin, rMax } = ismMapGridRadius(geometry);
  const out = new Float32Array(ISM_MAP_AZ * ISM_MAP_RINGS);
  if (geometry.numArms <= 0) return out;

  for (let ring = 0; ring < ISM_MAP_RINGS; ring++) {
    const r = ismMapRingRadius(ring, ISM_MAP_RINGS, rMin, rMax);
    if (r <= geometry.armStartRadius) continue;
    const logR = Math.log(r / geometry.armStartRadius);
    const sigmaAcross = Math.max(armCrossSigma(r, geometry, tuning), 1e-4);

    for (const arm of geometry.arms) {
      const envelope = armFadeEnvelope(r, geometry, arm);
      if (envelope <= 0) continue;
      const point = armRidgeCurvePoint(logR, geometry, arm);
      const ridgeAngle = Math.atan2(point[2], point[0]);
      const rowBase = ring * ISM_MAP_AZ;

      for (let az = 0; az < ISM_MAP_AZ; az++) {
        const theta = (2 * Math.PI * az) / ISM_MAP_AZ;
        const raw = theta - ridgeAngle;
        const wrapped = Math.atan2(Math.sin(raw), Math.cos(raw));
        const crossDist = r * wrapped;
        const gauss = Math.exp(-0.5 * (crossDist / sigmaAcross) ** 2);
        const idx = rowBase + az;
        out[idx] = Math.min(1, out[idx]! + envelope * gauss);
      }
    }
  }
  return out;
}

describe('buildGalaxyIsmMapArmForcing', () => {
  it('memoizes on tuning.arms.widthScale VALUE, not tuning object identity — an unrelated slider drag hits cache, widthScale forces a real recompute', () => {
    const geometry = describeGalaxy(MILKY_WAY_GALAXY_PARAMS);
    const tuningA = DEFAULT_GALAXY_FIELD_TUNING;
    const first = buildGalaxyIsmMapArmForcing(geometry, tuningA);

    // The settings tool rebuilds `tuning` as a fresh object on every drag —
    // a fluid-slider change is a new object whose arms.widthScale is
    // untouched, which is exactly the case the memo exists for.
    const tuningFluidDrag: GalaxyFieldTuning = {
      ...tuningA,
      ismMapFluid: { ...tuningA.ismMapFluid, eventRate: tuningA.ismMapFluid.eventRate + 1 },
    };
    const hit = buildGalaxyIsmMapArmForcing(geometry, tuningFluidDrag);
    expect(hit).toBe(first);

    const tuningWiderArms: GalaxyFieldTuning = {
      ...tuningA,
      arms: { ...tuningA.arms, widthScale: tuningA.arms.widthScale * 2 },
    };
    const recomputed = buildGalaxyIsmMapArmForcing(geometry, tuningWiderArms);
    expect(recomputed).not.toBe(first);
    // A real recompute, not just a new array with the same contents: doubling
    // widthScale widens every arm's cross-sigma, so the field's total mass grows.
    const sum = (f: Float32Array) => f.reduce((acc, v) => acc + v, 0);
    expect(sum(recomputed)).toBeGreaterThan(sum(first));
  });

  it('memoizes on geometry identity — a fresh geometry object forces a recompute even with the same tuning', () => {
    const geometryA = describeGalaxy(MILKY_WAY_GALAXY_PARAMS);
    const geometryB = describeGalaxy(MILKY_WAY_GALAXY_PARAMS);
    const tuning = DEFAULT_GALAXY_FIELD_TUNING;

    const a = buildGalaxyIsmMapArmForcing(geometryA, tuning);
    const b = buildGalaxyIsmMapArmForcing(geometryB, tuning);
    // Not `expect(b).not.toBe(a)`: on a pass, vitest's `.not.toBe()` still runs
    // a deep-equals over both 786432-element arrays to decide whether to print
    // a "these are equal, use toEqual" hint — ~1.4s wall, not the ~20ms bake,
    // is where this test's time actually went. `Object.is` sidesteps it.
    expect(Object.is(a, b)).toBe(false);
  }, 15000); // margin over the ~20ms bake, for whatever's left after the fix above

  it('the windowed inner loop matches the full unwindowed sweep to within 1e-4', () => {
    const geometry = describeGalaxy(MILKY_WAY_GALAXY_PARAMS);
    // Spurs off here: `referenceForcing` is the arms-only pre-windowing
    // algorithm and stays that way (its job is pinning the az-window
    // optimization, not re-deriving the spur walk) — the spurs-vs-gate
    // behaviour has its own describe block below.
    const tuning: GalaxyFieldTuning = {
      ...DEFAULT_GALAXY_FIELD_TUNING,
      arms: {
        ...DEFAULT_GALAXY_FIELD_TUNING.arms,
        spurs: { ...DEFAULT_GALAXY_FIELD_TUNING.arms.spurs, enabled: false },
      },
    };

    const windowed = buildGalaxyIsmMapArmForcing(geometry, tuning);
    const reference = referenceForcing(geometry, tuning);
    expect(windowed.length).toBe(reference.length);

    let maxAbsDiff = 0;
    for (let i = 0; i < windowed.length; i++) {
      maxAbsDiff = Math.max(maxAbsDiff, Math.abs(windowed[i]! - reference[i]!));
    }
    expect(maxAbsDiff).toBeLessThan(1e-4);
  });
});

describe('buildGalaxyIsmMapArmForcing — arm spur coupling (arms.spurs.gasWeight)', () => {
  const geometry = describeGalaxy(MILKY_WAY_GALAXY_PARAMS);

  function withGasWeight(gasWeight: number): GalaxyFieldTuning {
    return {
      ...DEFAULT_GALAXY_FIELD_TUNING,
      arms: {
        ...DEFAULT_GALAXY_FIELD_TUNING.arms,
        spurs: { ...DEFAULT_GALAXY_FIELD_TUNING.arms.spurs, gasWeight },
      },
    };
  }

  it('gasWeight 0 reproduces the arms-only field exactly — spurs off costs nothing and changes nothing', () => {
    const tuningZeroWeight = withGasWeight(0);
    const tuningSpursDisabled: GalaxyFieldTuning = {
      ...DEFAULT_GALAXY_FIELD_TUNING,
      arms: {
        ...DEFAULT_GALAXY_FIELD_TUNING.arms,
        spurs: { ...DEFAULT_GALAXY_FIELD_TUNING.arms.spurs, enabled: false },
      },
    };

    const zeroWeight = buildGalaxyIsmMapArmForcing(geometry, tuningZeroWeight);
    const spursDisabled = buildGalaxyIsmMapArmForcing(geometry, tuningSpursDisabled);
    expect(zeroWeight).toEqual(spursDisabled);
  });

  it("gasWeight > 0 raises forcing at a known spur root, and leaves every texel inside every spur's excluded (pre-root) radius unchanged", () => {
    const spurTuning = DEFAULT_GALAXY_FIELD_TUNING.arms.spurs;
    const spurArms = buildArmSpurs(geometry, spurTuning, geometry.seed);
    expect(spurArms.length).toBeGreaterThan(0); // sanity: MW's defaults actually grow spurs

    const forcingZero = buildGalaxyIsmMapArmForcing(geometry, withGasWeight(0));
    const forcingRaised = buildGalaxyIsmMapArmForcing(geometry, withGasWeight(1));
    const { rMin, rMax } = ismMapGridRadius(geometry);

    // At the FIRST spur's own root, its ridge coincides exactly with its
    // parent arm's (armSpurGeometry.ts's continuity invariant) — raising
    // gasWeight must strictly raise the forcing there.
    const spur = spurArms[0]!;
    const rootRadius = geometry.armStartRadius * Math.exp(spur.spanStartLogR);
    const rootAngle = armRidgeAngle(spur.spanStartLogR, geometry, spur);
    const rootRing = ismMapRingIndexForRadius(rootRadius, ISM_MAP_RINGS, rMin, rMax);
    const rootAz =
      Math.round(((((rootAngle / (2 * Math.PI)) % 1) + 1) % 1) * ISM_MAP_AZ) % ISM_MAP_AZ;
    const rootIdx = rootRing * ISM_MAP_AZ + rootAz;
    expect(forcingRaised[rootIdx]!).toBeGreaterThan(forcingZero[rootIdx]!);

    // Below every spur's own spanStartLogR, no spur may contribute (the
    // gate this coupling depends on) — an entire ring there must be
    // byte-identical whether gasWeight is 0 or 1, regardless of azimuth.
    const minSpurStartRadius = Math.min(
      ...spurArms.map((s) => geometry.armStartRadius * Math.exp(s.spanStartLogR)),
    );
    const belowRing = ismMapRingIndexForRadius(
      minSpurStartRadius * 0.99,
      ISM_MAP_RINGS,
      rMin,
      rMax,
    );
    expect(belowRing).toBeLessThan(rootRing); // sanity: actually below the tested root
    const rowStart = belowRing * ISM_MAP_AZ;
    const zeroRow = forcingZero.slice(rowStart, rowStart + ISM_MAP_AZ);
    const raisedRow = forcingRaised.slice(rowStart, rowStart + ISM_MAP_AZ);
    expect(raisedRow).toEqual(zeroRow);
  });
});
