/**
 * skyEntryFactsAt — the centre spot is the ground the view looks at on a terrain host, and
 * nothing on a miss, off a terrain host, or above the entry ceiling.
 */
import { describe, it, expect } from 'vitest';

import { skyEntryFactsAt } from '../../../src/utils/sky/skyEntryFactsAt';
import { datumOnlyTerrainHeight } from '../../../src/utils/camera/terrain/datumOnlyTerrainHeight';
import { asSceneBodyId } from '../../../src/utils/scene/asSceneBodyId';
import { SCENE_CELESTIAL_BODIES } from '../../../src/data/bodies/sceneCelestialBodies';
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

const facts = (pose: BodyFixedPose) =>
  skyEntryFactsAt(pose, VIEWPORT, FRUSTUM, FOV, datumOnlyTerrainHeight);

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

  it('casts no ray above the entry ceiling', () => {
    const above = facts(poseAt('earth', 25_000, DOWN));
    expect(above.spot).toBeNull();
    expect(above.altitudeM).toBeCloseTo(25_000, 3);
  });
});
