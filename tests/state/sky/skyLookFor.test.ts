import { describe, expect, it } from 'vitest';

import { skyLookFor } from '../../../src/state/sky/skyLookFor';
import { altAzFromSpot } from '../../../src/utils/sky/altAzFromSpot';
import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';
import { rotateVec3ByTightMat3 } from '../../../src/utils/math/rotateVec3ByTightMat3';
import { asSceneBodyId } from '../../../src/utils/scene/asSceneBodyId';
import { degToRad } from '../../../src/utils/math/degToRad';
import { unixMsToJulianDays } from '../../../src/utils/time/unixMsToJulianDays';
import type { SkySpot } from '../../../src/@types/camera/pose/SkySpot';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import type { PositionedId } from '../../../src/@types/scene/PositionedId';

const EARTH = asSceneBodyId('earth');
const COPENHAGEN: SkySpot = { body: EARTH, lonRad: 0.2186, latRad: 0.9716 };
const SIM_DAYS = 2461000;
const LENS = degToRad(60);

/** A galaxy-far point at this declination, on the meridian opposite the spot (so below it now). */
function fixedTargetAt(declinationRad: number): Vec3 {
  const earth = deriveBodyStates(SIM_DAYS).get(EARTH as unknown as PositionedId)!;
  const lon = COPENHAGEN.lonRad + Math.PI;
  const dir = rotateVec3ByTightMat3(earth.orientation, [
    Math.cos(declinationRad) * Math.cos(lon),
    Math.cos(declinationRad) * Math.sin(lon),
    Math.sin(declinationRad),
  ]);
  return [dir[0] * 1e3, dir[1] * 1e3, dir[2] * 1e3];
}

const row = (positionMpc: Vec3, radiusMpc = 0.01) => ({ type: 'galaxy', positionMpc, radiusMpc });

describe('skyLookFor', () => {
  it('a target below the horizon faces its rise azimuth and keeps the lens', () => {
    const target = fixedTargetAt(0);
    const look = skyLookFor(row(target), COPENHAGEN, SIM_DAYS, LENS);
    if (look.kind !== 'belowHorizon') throw new Error(`expected belowHorizon, got ${look.kind}`);
    expect(look.neverRises).toBe(false);
    expect(look.riseAt).not.toBeNull();
    expect(look.riseAt! - SIM_DAYS).toBeLessThan(1);
    const atRise = altAzFromSpot(COPENHAGEN, target, deriveBodyStates(look.riseAt!));
    expect(atRise.altitudeRad).toBeCloseTo(0, 5);
    expect(look.azimuthRad).toBeCloseTo(atRise.azimuthRad, 9);
    // On the celestial equator a target rises due east.
    expect(Math.abs(look.azimuthRad - Math.PI / 2)).toBeLessThan(degToRad(1));
  });

  it('a fixed target that never clears this latitude says so, with no rise', () => {
    const look = skyLookFor(row(fixedTargetAt(degToRad(-60))), COPENHAGEN, SIM_DAYS, LENS);
    expect(look).toMatchObject({ kind: 'belowHorizon', riseAt: null, neverRises: true });
  });

  it('the Galactic Centre, posed from its place, never rises from 70° N', () => {
    const id = 'galactic-centre' as PositionedId;
    const centre = {
      type: 'blackHole',
      positionMpc: deriveBodyStates(SIM_DAYS).get(id)!.positionMpc,
      radiusMpc: 1e-12,
      driver: {
        poseId: id,
        boundingRadiusM: 0,
        footprintRadiusM: 0,
        groundRadiusM: null,
        standoffRadii: 0,
      },
    };
    const north: SkySpot = { body: EARTH, lonRad: 0, latRad: degToRad(70) };
    const look = skyLookFor(centre, north, SIM_DAYS, LENS);
    expect(look).toMatchObject({ kind: 'belowHorizon', riseAt: null, neverRises: true });
  });

  it('a target above the horizon is looked at, framed by its size', () => {
    const target = fixedTargetAt(Math.PI - COPENHAGEN.latRad - degToRad(5));
    const look = skyLookFor(row(target, 20), COPENHAGEN, SIM_DAYS, LENS);
    if (look.kind !== 'look') throw new Error(`expected look, got ${look.kind}`);
    expect(look.altitudeRad).toBeCloseTo(degToRad(85), 3);
    expect(look.fovYRad).toBeCloseTo(3 * 2 * Math.atan(20 / 1e3), 4);
  });

  it('the Sun in a polar night is a body that does not rise soon, not a never-rising star', () => {
    const bearIsland: SkySpot = { body: EARTH, lonRad: degToRad(19), latRad: degToRad(74.5) };
    const midwinter = unixMsToJulianDays(Date.parse('2026-12-21T12:00:00Z'));
    const sun = {
      type: 'starCatalog',
      positionMpc: [0, 0, 0] as Vec3,
      radiusMpc: 2.25e-14,
      driver: {
        poseId: 'sun',
        boundingRadiusM: 0,
        footprintRadiusM: 0,
        groundRadiusM: null,
        standoffRadii: 0,
      },
    };
    const look = skyLookFor(sun, bearIsland, midwinter, LENS);
    expect(look).toMatchObject({ kind: 'belowHorizon', riseAt: null, neverRises: false });
  });
});
