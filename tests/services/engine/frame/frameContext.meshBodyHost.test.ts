/**
 * A mesh body owns no slab row — it rides its host's (`meshBodiesPass`). So the
 * host's roster gate decides whether the mesh body is drawn at all, and from a
 * 400 km orbit Earth's ~70° angular radius puts it outside the frustum gate
 * well before it is behind the eye. This pins the pose where that matters most:
 * the eye 2 m from the petunias with Earth at its back.
 */

import { describe, it, expect } from 'vitest';

import { deriveFrameContext } from '../../../../src/services/engine/frame/frameContext';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { absoluteArm } from '../../../../src/utils/camera/absoluteArm';
import { normalize3 } from '../../../../src/utils/math/normalize3';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { SCENE_MESH_BODIES } from '../../../../src/data/bodies/sceneMeshBodies';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { CameraProjection } from '../../../../src/@types/camera/CameraProjection';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { Mat3 } from '../../../../src/@types/math/Mat3';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const PROJECTION: CameraProjection = { fovYRad: 1, aspect: 16 / 9, near: 0.1, far: 10000 };
const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const EYE_STANDOFF_M = 2;

const STATE = {
  booted: true,
  gpu: {
    galaxyPointRenderer: {},
    galaxyPickRenderer: {},
    renderTargets: {},
    compositor: {},
    texturedBodyRenderer: null,
  },
  subsystems: { texturedDisks: {} },
  selectionRows: { hover: null, select: null, focus: null },
  data: {
    bodies: { earth: SCENE_EARTH, planets: [], stars: [], meshBodies: SCENE_MESH_BODIES },
  },
  settings: {
    starCatalogs: { enabled: false, items: { famousStar: { enabled: false } } },
    bodies: { items: { sun: { enabled: false }, 's-star': { enabled: false } } },
  },
} as unknown as EngineState;

describe('deriveFrameContext — a host carrying an on-screen mesh body', () => {
  it('keeps Earth in the slab table with the petunias filling the view and Earth behind the eye', () => {
    const states = deriveBodyStates(CONST_J2000);
    const petunias = states.get('petunias')!.positionMpc;
    const earth = states.get('earth')!.positionMpc;
    // Radially outward from Earth: aiming along it puts Earth ~180° off-axis
    // while the petunias sit dead centre at the eye's standoff.
    const outward = normalize3([
      petunias[0] - earth[0],
      petunias[1] - earth[1],
      petunias[2] - earth[2],
    ]);
    // The eye sits between Earth and the petunias, so the orbit pose's
    // target-to-eye direction is the inward one.
    const toEye: Vec3 = [-outward[0], -outward[1], -outward[2]];
    const pose: CameraPose = {
      target: [petunias[0], petunias[1], petunias[2]],
      yaw: Math.atan2(toEye[0], toEye[2]),
      pitch: Math.asin(toEye[1]),
      distance: EYE_STANDOFF_M * SCALE_UNITS.M_TO_MPC,
    };

    const ctx = deriveFrameContext(
      STATE,
      { width: 1920, height: 1080 } as unknown as HTMLCanvasElement,
      pose,
      absoluteArm(pose),
      PROJECTION,
      IDENTITY,
      IDENTITY,
      0,
      0,
      CONST_J2000,
    );

    expect(ctx.isReady).toBe(true);
    if (!ctx.isReady) return;
    expect(
      ctx.slabs.some((slab) => slab.frame.kind === 'body-m' && slab.frame.bodyId === 'earth'),
    ).toBe(true);
  });
});
