/**
 * atmosphereEntry — one body's atmosphere geometry from one view. Pinned: the params row it
 * resolves, the `inside` flag tracking the eye, and null wherever the fields could not be
 * read unguarded (no atmosphere, no pose).
 */

import { describe, it, expect, vi } from 'vitest';

import { atmosphereEntry } from '../../../../../src/layers/body/atmosphere/present/atmosphereEntry';
import { SCENE_EARTH } from '../../../../../src/data/bodies/sceneEarth';
import { ATMOSPHERE_PARAMS } from '../../../../../src/layers/body/atmosphere/data/atmosphereParams';
import { IDENTITY_MAT3 } from '../../../../../src/utils/math/identityMat3';
import { outerBoundRadiusM } from '../../../../../src/utils/occlusion/outerBoundRadiusM';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { FrameView } from '../../../../../src/@types/engine/frame/FrameView';
import type { BodyPoseProvider } from '../../../../../src/@types/engine/camera/BodyPoseProvider';
import type { Mat3 } from '../../../../../src/@types/math/Mat3';
import type { BodyState } from '../../../../../src/@types/scene/BodyState';
import { seededBodyStates } from '../../../../helpers/frame/seededBodyStates';
import { asSceneBodyId } from '../../../../../src/utils/scene/asSceneBodyId';

vi.mock('../../../../../src/services/engine/frame/sceneBodyStates', () => ({
  sceneBodyStates: () =>
    seededBodyStates(0, [
      {
        ...SCENE_EARTH,
        positionMpc: [-1e-15, 0, 0],
        orientation: [1, 0, 0, 0, 1, 0, 0, 0, 1] as unknown as BodyState['orientation'],
      },
    ]),
}));

const EARTH_RADIUS_M = outerBoundRadiusM(SCENE_EARTH.surface);
const STATE = {} as unknown as EngineState;

/** A view whose eye sits `radii` Earth-radii from every body's centre. */
function ctxAt(radii: number, bodyPose?: BodyPoseProvider): FrameView {
  const pose = { eyeRelBodyM: [radii * EARTH_RADIUS_M, 0, 0], basisM: [...IDENTITY_MAT3] as Mat3 };
  return { bodyPose: bodyPose ?? (() => pose) } as unknown as FrameView;
}

describe('atmosphereEntry', () => {
  it('resolves the body and its own ATMOSPHERE_PARAMS row', () => {
    const entry = atmosphereEntry(SCENE_EARTH.id, ctxAt(5), STATE)!;
    expect(entry.body).toBe(SCENE_EARTH);
    expect(entry.params).toBe(ATMOSPHERE_PARAMS['earth']);
  });

  it('flags the entry inside when the camera is within the shell handoff ratio', () => {
    // The flag selects the shell's full-screen render path, so it must track the
    // camera. Half an Earth radius out is 0.5 × 6371/6471 ≈ 0.49 atmosphere-top
    // radii — under the 1.005 handoff; five radii out is ≈ 4.92, far over it.
    expect(atmosphereEntry(SCENE_EARTH.id, ctxAt(0.5), STATE)!.inside).toBe(true);
    expect(atmosphereEntry(SCENE_EARTH.id, ctxAt(5), STATE)!.inside).toBe(false);
  });

  it('is null for a body with no pose or no atmosphere', () => {
    expect(
      atmosphereEntry(
        SCENE_EARTH.id,
        ctxAt(5, () => null),
        STATE,
      ),
    ).toBeNull();
    expect(atmosphereEntry(asSceneBodyId('moon'), ctxAt(5), STATE)).toBeNull();
  });
});
