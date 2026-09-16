/**
 * surfaceTilesEngaged — pins the two properties `earthPass.enabled` cannot
 * stand in for once the tile planner's gate is body-generic: the shared
 * foreground-distance cutoff, and — the joint this task actually creates —
 * that a registry body with no `earthRenderer` GPU handle still engages.
 */

import { describe, expect, it } from 'vitest';

import { surfaceTilesEngaged } from '../../../src/utils/surfaceTiles/surfaceTilesEngaged';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../src/services/engine/frame/foregroundMaxDistance';
import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';
import { bodyRelativePose } from '../../../src/services/engine/camera/bodyRelativePose';
import { imagePlaneBasis } from '../../../src/utils/camera/imagePlaneBasis';
import { frameUp } from '../../../src/utils/camera/frameUp';
import { normalize3 } from '../../../src/utils/math/normalize3';
import { mat3FromColumns } from '../../../src/utils/math/mat3FromColumns';
import { CONST_J2000 } from '../../../src/data/time/constJ2000';
import { SCENE_EARTH } from '../../../src/data/bodies/sceneEarth';
import { makeSlab } from '../../fixtures/makeSlab';
import type { PassState } from '../../../src/@types/engine/frame/PassState';
import type { ReadyFrameContext } from '../../../src/@types/engine/frame/ReadyFrameContext';
import type { SlabView } from '../../../src/@types/engine/frame/SlabView';
import type { BodyId } from '../../../src/@types/data/body/BodyId';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const EARTH_STATE = deriveBodyStates(CONST_J2000).get('earth')!;

/** A body-m SlabView for Earth — the only seeded `SURFACE_TILE_REGISTRY` row. */
const EARTH_VIEW: SlabView = {
  slab: makeSlab({ frame: { kind: 'body-m', bodyId: 'earth' } }),
  vp: new Float32Array(16),
  camPos: [0, 0, 5],
  viewportPx: [1280, 720],
};

/** A ctx whose camera sits `distanceMpc` from the origin, looking at Earth, with
 *  a real `bodyPose` (mirrors `frameContext.ts`'s own construction) so
 *  `prepareBodySurfaceFrame`'s pose lookup resolves for real rather than by mock. */
function makeCtx(distanceMpc: number): ReadyFrameContext {
  const camPosMpc: Vec3 = [
    EARTH_STATE.positionMpc[0] + 1e-13,
    EARTH_STATE.positionMpc[1],
    EARTH_STATE.positionMpc[2],
  ];
  const camForward = normalize3([
    EARTH_STATE.positionMpc[0] - camPosMpc[0],
    EARTH_STATE.positionMpc[1] - camPosMpc[1],
    EARTH_STATE.positionMpc[2] - camPosMpc[2],
  ]);
  const { right, up } = imagePlaneBasis(camForward, 0, frameUp(undefined));
  const camBasisWorld = mat3FromColumns(right, up, camForward);
  return {
    cam: { distance: distanceMpc, position: camPosMpc, target: EARTH_STATE.positionMpc },
    drawCamPos: camPosMpc,
    bodyPose: (bodyId: BodyId) =>
      bodyId === 'earth'
        ? bodyRelativePose({ camPosMpc, camBasisWorld, bodyState: EARTH_STATE })
        : null,
  } as unknown as ReadyFrameContext;
}

/** State with Earth's catalog data seeded, `earthRenderer` deliberately
 *  ABSENT — the gate this task exists to open (`earthPass.enabled` would
 *  refuse this state outright). */
const STATE_NO_EARTH_RENDERER: PassState = {
  gpu: {},
  data: { bodies: { earth: SCENE_EARTH, planets: [], stars: [] } },
} as unknown as PassState;

describe('surfaceTilesEngaged', () => {
  it('is false beyond the foreground distance', () => {
    expect(
      surfaceTilesEngaged(
        STATE_NO_EARTH_RENDERER,
        makeCtx(FOREGROUND_MAX_DISTANCE_MPC),
        EARTH_VIEW,
      ),
    ).toBe(false);
    expect(
      surfaceTilesEngaged(
        STATE_NO_EARTH_RENDERER,
        makeCtx(FOREGROUND_MAX_DISTANCE_MPC * 10),
        EARTH_VIEW,
      ),
    ).toBe(false);
  });

  it('is true for a registry body with no earthRenderer', () => {
    expect(
      surfaceTilesEngaged(
        STATE_NO_EARTH_RENDERER,
        makeCtx(FOREGROUND_MAX_DISTANCE_MPC / 2),
        EARTH_VIEW,
      ),
    ).toBe(true);
  });
});
