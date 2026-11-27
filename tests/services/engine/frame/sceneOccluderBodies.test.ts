/**
 * sceneOccluderBodies — Earth joins the occluders from `SCENE_EARTH_BODIES`, not a fixed import,
 * so a composition with no Earth row gets none, and the app's Earth only once it is resolved.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { sceneOccluderBodies } from '../../../../src/services/engine/frame/sceneOccluderBodies';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { innerBoundRadiusM } from '../../../../src/utils/occlusion/innerBoundRadiusM';
import type { EarthBody } from '../../../../src/@types/scene/EarthBody';
import type { PassState } from '../../../../src/@types/engine/frame/PassState';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { Vec3 } from '../../../../packages/shared/src/@types/math/Vec3';

// Lets one case compose no Earth row; every other case reads the real list.
const earthRowsOverride = vi.hoisted(() => ({ value: null as readonly EarthBody[] | null }));
vi.mock('../../../../src/data/bodies/sceneEarthBodies', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../src/data/bodies/sceneEarthBodies')>();
  return {
    get SCENE_EARTH_BODIES() {
      return earthRowsOverride.value ?? actual.SCENE_EARTH_BODIES;
    },
  };
});

const STATES = deriveBodyStates(CONST_J2000);
const STATE = {} as PassState;
// 720-px viewport, 45° fovY.
const PX_PER_RAD = 720 / (2 * Math.tan(Math.PI / 8));

function ctxAtEarthOffsetKm(offsetKm: number): FrameView {
  const p = STATES.get(SCENE_EARTH.id)!.positionMpc;
  const drawCamPos: Vec3 = [p[0] + offsetKm * SCALE_UNITS.KM_TO_MPC, p[1], p[2]];
  return {
    snapshot: { bodyStates: STATES, sceneBodies: [] },
    drawCamPos,
    drawPxPerRad: PX_PER_RAD,
  } as unknown as FrameView;
}

afterEach(() => {
  earthRowsOverride.value = null;
});

describe('sceneOccluderBodies', () => {
  it('returns nothing with no Earth row and no scene bodies', () => {
    earthRowsOverride.value = [];
    expect(sceneOccluderBodies(STATE, ctxAtEarthOffsetKm(20_000))).toEqual([]);
  });

  it('adds Earth once it is resolvePx across', () => {
    // At 20 000 km Earth spans ~550 px; from ~1 AU it is a hundredth of a pixel.
    const near = sceneOccluderBodies(STATE, ctxAtEarthOffsetKm(20_000));
    expect(near.map((o) => o.radiusM)).toEqual([innerBoundRadiusM(SCENE_EARTH.surface)]);
    expect(sceneOccluderBodies(STATE, ctxAtEarthOffsetKm(1.5e8))).toEqual([]);
  });
});
