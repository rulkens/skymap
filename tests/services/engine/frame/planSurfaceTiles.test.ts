/**
 * planSurfaceTiles — the tile planner reads the rig's views, not the canvas
 * alone, and votes awake on frames where nothing can engage yet.
 */

import { describe, expect, it, vi } from 'vitest';

import { planSurfaceTiles } from '../../../../src/services/engine/frame/planSurfaceTiles';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { bodyRelativePose } from '../../../../src/services/engine/camera/bodyRelativePose';
import { imagePlaneBasis } from '../../../../src/utils/camera/imagePlaneBasis';
import { frameUp } from '../../../../src/utils/camera/frameUp';
import { normalize3 } from '../../../../src/utils/math/normalize3';
import { mat3FromColumns } from '../../../../src/utils/math/mat3FromColumns';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../../src/data/rendering/foregroundMaxDistance';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { makeSlab } from '../../../fixtures/makeSlab';
import type { PassState } from '../../../../src/@types/engine/frame/PassState';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { BodyId } from '../../../../src/@types/data/body/BodyId';
import type { SurfaceTileSubsystem } from '../../../../src/@types/engine/subsystems/SurfaceTileSubsystem';
import type { SurfaceCutTile } from '../../../../src/@types/scene/SurfaceCutTile';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const CUT: readonly SurfaceCutTile[] = [{ marker: 'cut' } as unknown as SurfaceCutTile];

vi.mock('../../../../src/utils/surfaceTiles/cutSurfaceTiles', () => ({
  cutSurfaceTiles: () => ({ cut: CUT, requests: [] }),
}));

const EARTH_STATE = deriveBodyStates(CONST_J2000).get('earth')!;

/** A real-pose view; `withEarthSlab` decides whether Earth's body-m row is in it. */
function makeView(withEarthSlab: boolean): FrameView {
  const camPosMpc: Vec3 = [
    EARTH_STATE.positionMpc[0] + 1e-13,
    EARTH_STATE.positionMpc[1],
    EARTH_STATE.positionMpc[2],
  ];
  const forward = normalize3([
    EARTH_STATE.positionMpc[0] - camPosMpc[0],
    EARTH_STATE.positionMpc[1] - camPosMpc[1],
    EARTH_STATE.positionMpc[2] - camPosMpc[2],
  ]);
  const { right, up } = imagePlaneBasis(forward, 0, frameUp(undefined));
  const camBasisWorld = mat3FromColumns(right, up, forward);
  return {
    snapshot: { simDays: CONST_J2000 },
    cam: { distance: FOREGROUND_MAX_DISTANCE_MPC / 2, position: camPosMpc },
    drawCamPos: camPosMpc,
    canvasSize: { width: 1280, height: 720 },
    slabs: [
      withEarthSlab
        ? makeSlab({ index: 0, frame: { kind: 'body-m', hostId: 'earth' } })
        : makeSlab({ index: 0 }),
    ],
    bodyPose: (bodyId: BodyId) =>
      bodyId === 'earth'
        ? bodyRelativePose({ camPosMpc, camBasisWorld, bodyState: EARTH_STATE })
        : null,
  } as unknown as FrameView;
}

const STATE = {
  tier: 'low',
  gpu: {},
  data: { bodies: { earth: SCENE_EARTH, planets: [] } },
  assetSlots: { bodyTextures: new Map() },
} as unknown as PassState;

function makeTiles(animating: boolean) {
  const tiles = {
    plannerParams: vi.fn(() => ({})),
    update: vi.fn(),
    release: vi.fn(),
    residentSlot: vi.fn(),
    engagedBodyId: vi.fn(() => null),
    isAnimating: vi.fn(() => animating),
  };
  return { tiles, subsystem: tiles as unknown as SurfaceTileSubsystem };
}

describe('planSurfaceTiles', () => {
  it('engages a tiling body seen only by a later view', () => {
    const { tiles, subsystem } = makeTiles(false);
    const result = planSurfaceTiles(subsystem, [makeView(false), makeView(true)], STATE);
    expect(result.value).toBe(CUT);
    expect(tiles.update).toHaveBeenCalledTimes(1);
    expect(tiles.update.mock.calls[0]![0].bodyId).toBe('earth');
  });

  it('votes awake while the manifest loads, even disengaged', () => {
    const { tiles, subsystem } = makeTiles(true);
    const result = planSurfaceTiles(subsystem, [makeView(false), makeView(false)], STATE);
    expect(result.awake).toBe(true);
    expect(result.value).toEqual([]);
    expect(tiles.update).not.toHaveBeenCalled();
  });

  it('a disengaged frame returns an empty cut', () => {
    const { subsystem } = makeTiles(false);
    expect(planSurfaceTiles(subsystem, [makeView(true)], STATE).value).toBe(CUT);
    expect(planSurfaceTiles(subsystem, [makeView(false)], STATE).value).toEqual([]);
  });
});
