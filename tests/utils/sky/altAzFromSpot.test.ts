import { describe, expect, it } from 'vitest';

import { altAzFromSpot } from '../../../src/utils/sky/altAzFromSpot';
import { siteEyeFrame } from '../../../src/services/engine/camera/arms/utils/siteEyeFrame';
import { skySpotRadial } from '../../../src/utils/geo/skySpotRadial';
import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';
import { rotateVec3ByTightMat3 } from '../../../src/utils/math/rotateVec3ByTightMat3';
import { asSceneBodyId } from '../../../src/utils/scene/asSceneBodyId';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { SCENE_CELESTIAL_BODIES } from '../../../src/data/bodies/sceneCelestialBodies';
import type { SkySpot } from '../../../src/@types/camera/pose/SkySpot';
import type { Vec3 } from '../../../src/@types/math/Vec3';

describe('altAzFromSpot', () => {
  it('returns finite values at latitude 89.9°, where east/north degenerate', () => {
    const spot = {
      body: asSceneBodyId('earth'),
      lonRad: 0.3,
      latRad: 89.9 * (Math.PI / 180),
    };
    const { azimuthRad, altitudeRad } = altAzFromSpot(spot, [0, 0, 0], 2461000);
    expect(Number.isFinite(azimuthRad)).toBe(true);
    expect(Number.isFinite(altitudeRad)).toBe(true);
  });

  it('measures from the ground: a Moon-distance target due east of the eye sits on the horizon', () => {
    const simDays = 2461000;
    const spot: SkySpot = { body: asSceneBodyId('earth'), lonRad: 0.2186, latRad: 0.9716 };
    const earth = deriveBodyStates(simDays).get(asSceneBodyId('earth') as never)!;
    const eastWorld = rotateVec3ByTightMat3(earth.orientation, [
      ...siteEyeFrame(skySpotRadial(spot)).east,
    ] as Vec3);
    const radiusMpc =
      SCENE_CELESTIAL_BODIES.find((b) => b.id === 'earth')!.surface.datumRadiusM *
      SCALE_UNITS.M_TO_MPC;
    const up = rotateVec3ByTightMat3(earth.orientation, skySpotRadial(spot));
    const eye: Vec3 = [0, 1, 2].map((i) => earth.positionMpc[i]! + up[i]! * radiusMpc) as Vec3;
    const d = 384_400_000 * SCALE_UNITS.M_TO_MPC;
    const target: Vec3 = [0, 1, 2].map((i) => eye[i]! + eastWorld[i]! * d) as Vec3;
    const { azimuthRad, altitudeRad } = altAzFromSpot(spot, target, simDays);
    // From the centre it would read ~0.95° up.
    expect(Math.abs(altitudeRad)).toBeLessThan(1e-9);
    expect(azimuthRad).toBeCloseTo(Math.PI / 2, 9);
  });
});
