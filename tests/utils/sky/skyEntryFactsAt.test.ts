/**
 * skyEntryFactsAt — the centre spot is the ground the view looks at on a terrain host, at any
 * altitude (a far entry reads it over the spot), and nothing on a miss or off a terrain host.
 */
import { describe, it, expect } from 'vitest';

import { skyEntryFactsAt } from '../../../src/utils/sky/skyEntryFactsAt';
import { datumOnlyTerrainHeight } from '../../../src/utils/camera/terrain/datumOnlyTerrainHeight';
import { asSceneBodyId } from '../../../src/utils/scene/asSceneBodyId';
import { SCENE_CELESTIAL_BODIES } from '../../../src/data/bodies/sceneCelestialBodies';
import { hostOrThrow } from '../../../src/services/engine/camera/arms/hostOrThrow';
import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';
import { IDENTITY_MAT3 } from '../../../src/utils/math/identityMat3';
import { CONST_J2000 } from '../../../src/data/time/constJ2000';
import { ARRIVAL_APPROACH_ALT_M } from '../../../src/data/sky/arrivalApproachAltM';
import { SKY_ENTRY_MAX_ALT_M } from '../../../src/data/sky/skyEntryMaxAltM';
import type { BodyFixedPose } from '../../../src/@types/camera/pose/BodyFixedPose';
import type { Mat3 } from '../../../src/@types/math/Mat3';

const FOV = Math.PI / 3;
const T = Math.tan(FOV / 2);
const FRUSTUM = { tanLeft: -T * 1.5, tanRight: T * 1.5, tanDown: -T, tanUp: T };
const VIEWPORT = [1200, 800] as const;
// Columns right | up | forward: looking down −X (at the body) or up +X (at the sky).
const DOWN: Mat3 = [0, 1, 0, 0, 0, 1, -1, 0, 0];
const UP: Mat3 = [0, -1, 0, 0, 0, 1, 1, 0, 0];

const radiusOf = (id: string) =>
  SCENE_CELESTIAL_BODIES.find((b) => b.id === id)!.surface.datumRadiusM;

function poseAt(id: string, altitudeM: number, basisLocal: Mat3): BodyFixedPose {
  return {
    bodyId: asSceneBodyId(id),
    anchorLocalM: [0, 0, 0],
    eyeRelAnchorM: [radiusOf(id) + altitudeM, 0, 0],
    basisLocal,
  };
}

const ctx = {
  bodies: deriveBodyStates(CONST_J2000),
  poseBasis: IDENTITY_MAT3,
  upBasis: IDENTITY_MAT3,
  terrainHeightAt: datumOnlyTerrainHeight,
};

const facts = (pose: BodyFixedPose) =>
  skyEntryFactsAt(pose, hostOrThrow({ body: pose.bodyId }, ctx), VIEWPORT, FRUSTUM, FOV);

describe('skyEntryFactsAt', () => {
  it('names the ground under the view centre on Earth', () => {
    const { spot, pointLocalM, altitudeM } = facts(poseAt('earth', 5_000, DOWN));
    expect(altitudeM).toBeCloseTo(5_000, 3);
    expect(spot).toEqual({ body: 'earth', lonRad: 0, latRad: 0 });
    expect(pointLocalM![0]).toBeCloseTo(radiusOf('earth'), 0);
  });

  it('offers nothing when the centre ray misses the ground', () => {
    expect(facts(poseAt('earth', 5_000, UP)).spot).toBeNull();
  });

  it('offers nothing over a body that is not a terrain host', () => {
    expect(facts(poseAt('jupiter', 5_000, DOWN)).spot).toBeNull();
  });

  it('names the ground above the entry ceiling where a far entry’s approach ends', () => {
    const reliefTopM = SCENE_CELESTIAL_BODIES.find((b) => b.id === 'mars')!.surface.reliefM[1];
    const approachEnd = facts(poseAt('mars', reliefTopM + ARRIVAL_APPROACH_ALT_M, DOWN));
    expect(approachEnd.altitudeM).toBeGreaterThanOrEqual(SKY_ENTRY_MAX_ALT_M);
    expect(approachEnd.spot).toEqual({ body: 'mars', lonRad: 0, latRad: 0 });
  });

  it('casts nothing above the ceiling and past the approach, but keeps the altitude', () => {
    const reliefTopM = SCENE_CELESTIAL_BODIES.find((b) => b.id === 'mars')!.surface.reliefM[1];
    const past = facts(poseAt('mars', reliefTopM + ARRIVAL_APPROACH_ALT_M + 2_000, DOWN));
    expect(past).toEqual({ spot: null, pointLocalM: null, altitudeM: past.altitudeM });
    expect(past.altitudeM).toBeCloseTo(reliefTopM + ARRIVAL_APPROACH_ALT_M + 2_000, 3);
  });
});
