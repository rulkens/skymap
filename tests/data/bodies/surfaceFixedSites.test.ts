import { describe, it, expect } from 'vitest';
import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../src/data/time/constJ2000';
import { MESH_ASSETS } from '../../../src/data/bodies/meshAssets.generated';
import { SCENE_MESH_BODIES } from '../../../src/data/bodies/sceneMeshBodies';
import { SCENE_PLANETS } from '../../../src/data/bodies/scenePlanets';
import { SURFACE_FIXED_SITES } from '../../../src/data/bodies/surfaceFixedSites';
import { rotationRowById } from '../../../src/data/bodies/rotationElements';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { findByIdOrThrow } from '../../../src/utils/object/findByIdOrThrow';

const marsRow = rotationRowById('mars');
if (marsRow === null || (marsRow.kind !== undefined && marsRow.kind !== 'iau-pole')) {
  throw new Error('surfaceFixedSites.test: the mars rotation row is no longer an IAU-pole row');
}
/** Mars's SIDEREAL day, from its own Ẇ — never the orbital period (spec ruling 24). */
const MARS_SIDEREAL_DAYS = 360 / marsRow.spinRateDegPerDay;
const MARS_RADIUS_M = findByIdOrThrow(SCENE_PLANETS, 'mars', 'surfaceFixedSites.test').radiusM;

function offsetFromMarsMpc(simDays: number): readonly number[] {
  const states = deriveBodyStates(simDays);
  const rover = states.get('curiosity')!.positionMpc;
  const mars = states.get('mars')!.positionMpc;
  return [rover[0] - mars[0], rover[1] - mars[1], rover[2] - mars[2]];
}

function angleDeg(a: readonly number[], b: readonly number[]): number {
  const dot = a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  const cos = dot / (Math.hypot(a[0]!, a[1]!, a[2]!) * Math.hypot(b[0]!, b[1]!, b[2]!));
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
}

describe('the Mars rover landing sites', () => {
  it('a rover turns with Mars', () => {
    // The rover's body-fixed coordinates never change, so its offset from Mars
    // must be exactly periodic in Mars's sidereal day and must sweep with the
    // spin in between. Fails on a dropped host spin, a west-positive longitude
    // read as east, or a site placed in the wrong frame — none of which is
    // visible in the row itself.
    const at = offsetFromMarsMpc(CONST_J2000);
    const afterOneTurn = offsetFromMarsMpc(CONST_J2000 + MARS_SIDEREAL_DAYS);
    const afterQuarterTurn = offsetFromMarsMpc(CONST_J2000 + MARS_SIDEREAL_DAYS / 4);

    expect(angleDeg(at, afterOneTurn)).toBeLessThan(0.05);

    // A quarter turn is NOT 90° of arc: the site rides a cone about the pole at
    // colatitude 90° − lat, and two of its generators 90° of longitude apart
    // subtend acos(cos²(colatitude)) — 89.633° at Curiosity's −4.5895°.
    // Asserting a flat 90° would be asserting the equator.
    const colatitudeRad = ((90 + 4.5895) * Math.PI) / 180;
    const expectedDeg = (Math.acos(Math.cos(colatitudeRad) ** 2) * 180) / Math.PI;
    expect(angleDeg(at, afterQuarterTurn)).toBeCloseTo(expectedDeg, 2);
  });

  it('a rover stands on the surface', () => {
    // A 3390 km offset recovered by differencing two ~1.5 au doubles: one ulp
    // at that magnitude is ~50 µm, and the residual lands at ~5 µm. Hence 50 µm
    // rather than the nanometres the metre-space arithmetic would deserve.
    const site = findByIdOrThrow(SURFACE_FIXED_SITES, 'curiosity', 'surfaceFixedSites.test');
    const distanceM =
      Math.hypot(...(offsetFromMarsMpc(CONST_J2000) as number[])) / SCALE_UNITS.M_TO_MPC;

    expect(distanceM).toBeCloseTo(MARS_RADIUS_M + site.altitudeM, 4);
  });

  it('every surface-fixed site is lifted by its asset’s ground offset', () => {
    // An invariant across two independently-edited files: the bake decides where
    // a mesh's origin sits, so a re-bake that moves it must move the site with
    // it. Eyeballing the altitude back would bury a rover or float it.
    for (const site of SURFACE_FIXED_SITES) {
      const body = findByIdOrThrow(SCENE_MESH_BODIES, site.id, 'surfaceFixedSites.test');
      expect(site.altitudeM, site.id).toBe(MESH_ASSETS[body.meshKey]!.groundOffsetM);
    }
  });
});
