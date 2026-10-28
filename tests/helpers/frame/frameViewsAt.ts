/**
 * Real views of a real frame — the shipped scene bodies at `simDays`, the eye at
 * `eyeMpc` looking along `forward` — one per rig `rotation` (the canvas view
 * alone by default). `distanceMpc` is the orbit distance, separate from the eye
 * so a test can put the eye anywhere and still pick which side of a
 * `cam.distance` gate it sits on.
 */

import type { EngineState } from '../../../src/@types/engine/state/EngineState';
import type { FrameView } from '../../../src/@types/engine/frame/FrameView';
import type { Mat3 } from '../../../src/@types/math/Mat3';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import { deriveFrameContext } from '../../../src/services/engine/frame/frameContext';
import { deriveView } from '../../../src/services/engine/frame/deriveView';
import { assembleOrbitCamera } from '../../../src/services/engine/camera/assembleOrbitCamera';
import { absoluteArm } from '../../../src/utils/camera/absoluteArm';
import { symmetricFrustum } from '../../../src/utils/camera/symmetricFrustum';
import { cross3 } from '../../../src/utils/math/cross3';
import { normalize3 } from '../../../src/utils/math/normalize3';
import { mat3FromColumns } from '../../../src/utils/math/mat3FromColumns';
import { BODY_SLAB_ROWS } from '../../../src/layers/body/present/bodySlabRows';
import { SCENE_EARTH } from '../../../src/data/bodies/sceneEarth';
import { SCENE_PLANETS } from '../../../src/data/bodies/scenePlanets';
import { SCENE_MESH_BODIES } from '../../../src/data/bodies/sceneMeshBodies';
import { FLAT_TERRAIN } from '../../../src/data/camera/flatTerrain';
import { CONST_J2000 } from '../../../src/data/time/constJ2000';

const FOV_Y_RAD = 1;
const SIZE_PX = { width: 1920, height: 1080 };
const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function frameViewsAt(input: {
  readonly eyeMpc: Readonly<Vec3>;
  readonly forward: Readonly<Vec3>;
  readonly distanceMpc: number;
  readonly rotations?: readonly Mat3[];
  readonly simDays?: number;
}): FrameView[] {
  const { eyeMpc, distanceMpc, rotations = [IDENTITY], simDays = CONST_J2000 } = input;
  const forward = normalize3([...input.forward] as Vec3);
  // yaw = pitch = 0 decodes forward as −(third column) and puts the eye at
  // target + distance·(third column), so the target sits `distanceMpc` ahead.
  const ref: Vec3 = Math.abs(forward[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const right = normalize3(cross3(forward, ref));
  const up = cross3(right, forward);
  const basis = mat3FromColumns(right, up, [-forward[0], -forward[1], -forward[2]]);
  const pose = {
    target: [
      eyeMpc[0] + forward[0] * distanceMpc,
      eyeMpc[1] + forward[1] * distanceMpc,
      eyeMpc[2] + forward[2] * distanceMpc,
    ] as Vec3,
    yaw: 0,
    pitch: 0,
    distance: distanceMpc,
  };
  const projection = {
    fovYRad: FOV_Y_RAD,
    aspect: SIZE_PX.width / SIZE_PX.height,
    near: 1e-12,
    far: 1e4,
  };
  const cam = assembleOrbitCamera(pose, projection, basis, basis);
  const state = {
    booted: true,
    gpu: { galaxyPointRenderer: {}, renderTargets: {}, galaxyPickRenderer: {}, compositor: {} },
    terrain: FLAT_TERRAIN,
    subsystems: { texturedDisks: {} },
    selectionRows: { hover: null, select: null, focus: null },
    slabRows: BODY_SLAB_ROWS,
    visibilityEntries: [],
    data: { bodies: { earth: SCENE_EARTH, planets: SCENE_PLANETS, meshBodies: SCENE_MESH_BODIES } },
    settings: { bodies: { items: {} } },
    picking: { pickInFlight: false, cursorTexPx: null },
  } as unknown as EngineState;
  const snapshot = deriveFrameContext(state, {
    cam,
    arm: absoluteArm(pose),
    altitudeMpc: distanceMpc,
    nowMs: 0,
    simDays,
  });
  if (!snapshot.isReady) throw new Error('frameViewsAt: frame not ready');
  return rotations.map((rotation, slot) =>
    deriveView(snapshot, cam, {
      id: `view-${slot}`,
      rotation,
      eyeOffsetMpc: [0, 0, 0],
      frustum: symmetricFrustum(FOV_Y_RAD, SIZE_PX.width / SIZE_PX.height),
      sizePx: SIZE_PX,
      slot,
      kind: 'frame',
    }),
  );
}
