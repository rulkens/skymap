/**
 * cameraDebugSnapshotOf — pure projection for the DebugPanel's "Camera" section.
 * Takes the primitives `runFrame`'s fold already resolved (never recomputes the
 * regime) and derives the orientation pipeline through the SAME helpers the live
 * path uses, so the readout cannot drift from the mechanism: heading is measured
 * in the band-blended reference the engaged settle converges against. The
 * epoch-mismatch floor is in `liveSimDays`'s own currency: `deriveSimDays` is
 * affine in `nowMs` for a fixed `time`, so its slope over two seconds of poll
 * jitter is the floor (I4).
 */

import type { BodyId } from '../../@types/data/body/BodyId';
import type { BodyState } from '../../@types/scene/BodyState';
import type { CameraDebugSnapshot } from '../../@types/camera/CameraDebugSnapshot';
import type { CameraPose } from '../../@types/camera/CameraPose';
import type { FramedCameraPose } from '../../@types/camera/FramedCameraPose';
import type { Mat3 } from '../../@types/math/Mat3';
import type { PoseFrame } from '../../@types/camera/PoseFrame';
import type { SurfaceGesture } from '../../@types/camera/SurfaceGesture';
import type { TimeState } from '../../@types/time/TimeState';
import type { Vec3 } from '../../@types/math/Vec3';
import { SCENE_BODIES } from '../../data/bodies/sceneBodies';
import { hOverR } from '../../services/engine/camera/hOverR';
import { nearestBodyHR } from '../../services/engine/camera/nearestBodyHR';
import { bandRollTarget } from '../../services/engine/camera/frameAlignedRoll';
import { bodyRelativePose } from '../../services/engine/camera/bodyRelativePose';
import { deriveSimDays } from '../time/deriveSimDays';
import { eyeMpcOf } from './eyeMpcOf';
import { frameUp } from './frameUp';
import { blendedEnuAt } from './blendedEnuAt';
import { bodyUpWeight } from './bodyUpWeight';
import { refAzimuthOf } from './refAzimuthOf';
import { rotateVec3ByTightMat3T } from '../math/rotateVec3ByTightMat3T';
import { imagePlaneBasis } from './imagePlaneBasis';
import { maxTiltRad } from './maxTiltRad';
import { rollFromScreenUp } from './rollFromScreenUp';
import { tiltFromNadirRad } from './tiltFromNadirRad';
import { mat3FromColumns } from '../math/mat3FromColumns';
import { normalize3 } from '../math/normalize3';
import { rotateVec3ByTightMat3 } from '../math/rotateVec3ByTightMat3';
import { wrapRad } from '../math/wrapRad';

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
  /** The two gesture facts as they live on `SurfaceMemory`: a press with no
   * latch yet reads as `pointerDown` with a null `gesture`. */
  readonly pointerDown: boolean;
  readonly gesture: SurfaceGesture | null;
  readonly lastZoomFactor: number | null;
  readonly rememberedTiltRad: number;
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
    pointerDown,
    gesture,
    lastZoomFactor,
    rememberedTiltRad,
  } = input;
  const renderedFrame = renderedPose.frame;
  const eyeMpc = eyeMpcOf(worldPose, poseBasis);

  // Engaged body wins outright (spec's own regime predicate: `storedFrame` IS
  // the regime); the roster-wide nearest is only a stand-in for the "where's
  // the hysteresis band?" question while flying free in the absolute arm.
  let bodyId: BodyId | null = storedFrame !== 'absolute' ? storedFrame.body : null;
  let hr: number | null = null;
  if (bodyId !== null) {
    const bodyState = bodyStates.get(bodyId);
    const body = SCENE_BODIES.find((row) => row.id === bodyId);
    if (bodyState !== undefined && body !== undefined) hr = hOverR(eyeMpc, bodyState, body.radiusM);
  } else {
    const nearest = nearestBodyHR(eyeMpc, bodyStates);
    if (nearest !== null) {
      bodyId = nearest.bodyId;
      hr = nearest.hr;
    }
  }
  const radiusM =
    bodyId !== null ? SCENE_BODIES.find((row) => row.id === bodyId)?.radiusM : undefined;
  const altitudeM = hr !== null && radiusM !== undefined ? hr * radiusM : null;
  const ceilingRad = hr !== null ? maxTiltRad(hr) : null;

  const rollRad = worldPose.roll ?? 0;
  const forwardRaw: Vec3 = [
    worldPose.target[0] - eyeMpc[0],
    worldPose.target[1] - eyeMpc[1],
    worldPose.target[2] - eyeMpc[2],
  ];
  const degenerate = Math.hypot(...forwardRaw) === 0;
  const bodyState = bodyId !== null ? bodyStates.get(bodyId) : undefined;

  let headingRad: number | null = null;
  let tiltRad: number | null = null;
  let poleRollRad: number | null = null;
  if (!degenerate && bodyState !== undefined) {
    const forward = normalize3(forwardRaw);
    const upRef = frameUp(upBasis);
    const { right, up } = imagePlaneBasis(forward, rollRad, upRef);
    const { eyeRelBodyM, basisM } = bodyRelativePose({
      camPosMpc: eyeMpc,
      camBasisWorld: mat3FromColumns(right, up, forward),
      bodyState,
    });
    const localUp = normalize3(eyeRelBodyM);
    // A pole-frame heading here showed non-zero for a camera converged inside
    // the window, misleading the capture: measure in the SAME band-blended
    // reference the engaged settle converges against, with the pose's own up as
    // the carry, exactly as `eyeFrameOf` passes it.
    const sceneUpLocalBody = rotateVec3ByTightMat3T(upRef, bodyState.orientation);
    const forwardLocal: Vec3 = [basisM[6], basisM[7], basisM[8]];
    const upLocal: Vec3 = [basisM[3], basisM[4], basisM[5]];
    const { east, north } = blendedEnuAt(
      localUp,
      hr !== null ? bodyUpWeight(hr) : 1,
      sceneUpLocalBody,
      upLocal,
    );
    tiltRad = tiltFromNadirRad(forwardLocal, eyeRelBodyM);
    headingRad = refAzimuthOf(localUp, forwardLocal, upLocal, east, north);

    const pole = rotateVec3ByTightMat3([0, 0, 1], bodyState.orientation);
    const vert = pole[0] * forward[0] + pole[1] * forward[1] + pole[2] * forward[2];
    const poleHoriz: Vec3 = [
      pole[0] - forward[0] * vert,
      pole[1] - forward[1] * vert,
      pole[2] - forward[2] * vert,
    ];
    if (Math.hypot(...poleHoriz) > 1e-9) {
      poleRollRad = rollFromScreenUp(forward, normalize3(poleHoriz), upRef);
    }
  }
  const target = degenerate ? null : bandRollTarget(worldPose, bodyStates, poseBasis, upBasis);

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
    altitudeM,
    distanceMpc: worldPose.distance,
    orientationFrame,
    ceilingRad,
    bandUpWeight: hr !== null ? bodyUpWeight(hr) : null,
    rememberedTiltRad,
    headingRad,
    tiltRad,
    rollRad,
    poleRollRad,
    rollToPoleRad: poleRollRad !== null ? wrapRad(rollRad - poleRollRad) : null,
    bandTargetRollRad: target,
    rollToTargetRad: target !== null ? wrapRad(rollRad - target) : null,
    lastRenderedSimDays,
    liveSimDays,
    epochDeltaDays,
    epochMismatch: Math.abs(epochDeltaDays) > epochDeltaEpsDays,
    anchorLocalM: engagedPose !== null ? [...engagedPose.anchorLocalM] : null,
    eyeRelAnchorMagM: engagedPose !== null ? Math.hypot(...engagedPose.eyeRelAnchorM) : null,
    activeDriverId,
    gestureMode: pointerDown ? (gesture?.mode ?? 'down (unlatched)') : null,
    gestureCursorHit: pointerDown && gesture !== null ? gesture.anchorLocalM !== null : null,
    lastZoomDirection: lastZoomFactor === null ? null : lastZoomFactor < 1 ? 'in' : 'out',
  };
}
