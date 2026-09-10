/**
 * cameraDebugSnapshotOf — pure projection for the DebugPanel's "Camera" section.
 * Takes the primitives `runFrame`'s fold already resolved (never recomputes the
 * regime) and gets the orientation DOFs from `cameraDofAnglesOf`, the same home
 * `runFrame` feeds the per-frame delta record from — so a Δ is always a Δ of the
 * number on the row. The epoch-mismatch floor is in `liveSimDays`'s own
 * currency: `deriveSimDays` is affine in `nowMs` for a fixed `time`, so its
 * slope over two seconds of poll jitter is the floor (I4).
 */

import type { BodyId } from '../../@types/data/body/BodyId';
import type { BodyState } from '../../@types/scene/BodyState';
import type { CameraDebugSnapshot } from '../../@types/camera/CameraDebugSnapshot';
import type { CameraPose } from '../../@types/camera/CameraPose';
import type { FramedCameraPose } from '../../@types/camera/FramedCameraPose';
import type { Mat3 } from '../../@types/math/Mat3';
import type { OrientDeltas } from '../../@types/camera/OrientDeltas';
import type { PoseFrame } from '../../@types/camera/PoseFrame';
import type { SurfaceGesture } from '../../@types/camera/SurfaceGesture';
import type { TimeState } from '../../@types/time/TimeState';
import { SCENE_BODIES } from '../../data/bodies/sceneBodies';
import { deriveSimDays } from '../time/deriveSimDays';
import { cameraDofAnglesOf } from './cameraDofAnglesOf';
import { bodyUpWeight } from './bodyUpWeight';

const EPOCH_DELTA_TOLERANCE_MS = 2_000;

function sameFrame(a: PoseFrame, b: PoseFrame): boolean {
  if (a === 'absolute' || b === 'absolute') return a === b;
  return a.body === b.body;
}

export function cameraDebugSnapshotOf(input: {
  readonly storedFrame: PoseFrame;
  readonly renderedPose: FramedCameraPose;
  readonly worldPose: CameraPose;
  readonly poseBasis: Readonly<Mat3>;
  readonly upBasis: Readonly<Mat3>;
  readonly orientationFrame: string;
  readonly bodyStates: ReadonlyMap<BodyId, BodyState>;
  readonly lastRenderedSimDays: number;
  readonly liveSimDays: number;
  readonly time: TimeState;
  readonly activeDriverId: string;
  readonly gesture: SurfaceGesture | 'down' | null;
  readonly lastZoomFactor: number | null;
  readonly rememberedTiltRad: number;
  /** `readOrientDeltas()` — measured in the frame loop, never re-derived here. */
  readonly deltas: OrientDeltas;
}): CameraDebugSnapshot {
  const {
    storedFrame,
    renderedPose,
    worldPose,
    poseBasis,
    upBasis,
    orientationFrame,
    bodyStates,
    lastRenderedSimDays,
    liveSimDays,
    time,
    activeDriverId,
    gesture,
    lastZoomFactor,
    rememberedTiltRad,
    deltas,
  } = input;
  const renderedFrame = renderedPose.frame;
  const dofs = cameraDofAnglesOf({
    storedFrame,
    worldPose,
    poseBasis,
    upBasis,
    bodyStates,
    rememberedTiltRad,
  });
  const { bodyId, hOverR: hr } = dofs;
  const radiusM =
    bodyId !== null ? SCENE_BODIES.find((row) => row.id === bodyId)?.radiusM : undefined;

  const engagedPose = renderedFrame !== 'absolute' ? renderedPose.pose : null;
  const epochDeltaDays = liveSimDays - lastRenderedSimDays;
  const epochDeltaEpsDays = Math.abs(
    deriveSimDays(time, EPOCH_DELTA_TOLERANCE_MS) - deriveSimDays(time, 0),
  );

  return {
    storedFrame,
    renderedFrame,
    armMismatch: !sameFrame(storedFrame, renderedFrame),
    engagedBodyId: bodyId,
    hOverR: hr,
    altitudeM: hr !== null && radiusM !== undefined ? hr * radiusM : null,
    distanceMpc: worldPose.distance,
    orientationFrame,
    bandUpWeight: hr !== null ? bodyUpWeight(hr) : null,
    rememberedTiltRad,
    dofs,
    deltas,
    lastRenderedSimDays,
    liveSimDays,
    epochDeltaDays,
    epochMismatch: Math.abs(epochDeltaDays) > epochDeltaEpsDays,
    anchorLocalM: engagedPose !== null ? [...engagedPose.anchorLocalM] : null,
    eyeRelAnchorMagM: engagedPose !== null ? Math.hypot(...engagedPose.eyeRelAnchorM) : null,
    activeDriverId,
    gestureMode: gesture === null ? null : gesture === 'down' ? 'down (unlatched)' : gesture.mode,
    gestureCursorHit: gesture === null || gesture === 'down' ? null : gesture.anchorLocalM !== null,
    lastZoomDirection: lastZoomFactor === null ? null : lastZoomFactor < 1 ? 'in' : 'out',
  };
}
