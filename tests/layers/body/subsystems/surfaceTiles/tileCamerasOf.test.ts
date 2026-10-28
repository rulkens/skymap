/**
 * tileCamerasOf — the slab-free tile camera plans the same tiles as the camera
 * composed from Earth's `body-m` slab vp, at street level, in orbit and at the limb.
 */

import { describe, expect, it } from 'vitest';

import { tileCamerasOf } from '../../../../../src/layers/body/subsystems/surfaceTiles/tileCamerasOf';
import { deriveBodyStates } from '../../../../../src/services/engine/frame/deriveBodyStates';
import { composeBodySlabMvp } from '../../../../../src/utils/camera/composeBodySlabMvp';
import { cutSurfaceTiles } from '../../../../../src/layers/body/subsystems/surfaceTiles/cutSurfaceTiles';
import { baseLevelForTier } from '../../../../../src/utils/surfaceTiles/baseLevelForTier';
import { normalize3 } from '../../../../../src/utils/math/normalize3';
import { SURFACE_TILE_PX } from '../../../../../src/data/bodies/surfaceTileParams';
import { SCENE_EARTH } from '../../../../../src/data/bodies/sceneEarth';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import { CONST_J2000 } from '../../../../../src/data/time/constJ2000';
import { asSceneBodyId } from '../../../../../src/utils/scene/asSceneBodyId';
import { frameViewsAt } from '../../../../helpers/frame/frameViewsAt';
import type { TileCamera } from '../../../../../src/@types/scene/TileCamera';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

const EARTH_ID = asSceneBodyId('earth');
const RADIUS_M = SCENE_EARTH.surface.datumRadiusM;
const BASE_LEVEL = baseLevelForTier('earth', 'large');
const UP: Vec3 = normalize3([0.2, 0.9, -0.4]);

function requestsFor(camPosLocalM: Readonly<Vec3>, camera: TileCamera) {
  return cutSurfaceTiles({
    camPosLocalM,
    views: [camera],
    radiusM: RADIUS_M,
    reliefM: SCENE_EARTH.surface.reliefM,
    baseLevel: BASE_LEVEL,
    bands: [{ uBounds: [0, 1], vBounds: [0, 1], min: BASE_LEVEL + 1, max: 16 }],
    tilePx: SURFACE_TILE_PX,
    lodBias: 0,
    residentSlot: () => null,
  }).requests;
}

describe('tileCamerasOf', () => {
  it.each([
    // Eye altitude above the datum along UP, and the look direction.
    ['street level', 30, normalize3([-UP[0] + 0.9, -UP[1] + 0.1, -UP[2] + 0.4])],
    ['orbit', 0.1 * RADIUS_M, [-UP[0], -UP[1], -UP[2]] as Vec3],
    ['limb', 0.5 * RADIUS_M, normalize3([-UP[0] * 0.6 + 0.8, -UP[1] * 0.6, -UP[2] * 0.6])],
  ] as const)('the planner frustum culls as the slab frustum does: %s', (_, altitudeM, forward) => {
    const earth = deriveBodyStates(CONST_J2000).get(EARTH_ID)!.positionMpc;
    const r = (RADIUS_M + altitudeM) * SCALE_UNITS.M_TO_MPC;
    const [view] = frameViewsAt({
      eyeMpc: [earth[0] + UP[0] * r, earth[1] + UP[1] * r, earth[2] + UP[2] * r],
      forward,
      distanceMpc: 1e-12,
    });
    const slab = view!.slabs.find((s) => s.frame.kind === 'body-m' && s.frame.hostId === 'earth')!;
    const pose = view!.bodyPose(EARTH_ID)!;
    const fromSlab: TileCamera = {
      viewProjLocal: composeBodySlabMvp(slab.vp as Float64Array, pose.eyeRelBodyM, RADIUS_M),
      viewportPx: [view!.canvasSize.width, view!.canvasSize.height],
    };
    const [camera] = tileCamerasOf([view!], EARTH_ID, RADIUS_M);

    const expected = requestsFor(pose.eyeRelBodyM, fromSlab);
    expect(expected.requests.length).toBeGreaterThan(0);
    expect(requestsFor(pose.eyeRelBodyM, camera!)).toEqual(expected);
  });
});
