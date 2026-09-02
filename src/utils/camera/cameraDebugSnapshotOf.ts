/**
 * cameraDebugSnapshotOf — pure projection for the DebugPanel's "Camera"
 * section. Takes the primitives `runFrame`'s fold already resolves (never
 * recomputes the regime itself) and derives the full orientation pipeline —
 * roll against BOTH references (configured scene up, body spin axis), the
 * band's blended ride target, body-local heading/tilt — through the same
 * helpers the live path uses (`bandRollTarget`, `blendedEnuAt`,
 * `bodyRelativePose`), so the readout can never drift from the mechanism —
 * the heading is measured in the band-blended reference frame the engaged
 * settle actually converges against, never the raw pole frame.
 *
 * The epoch-mismatch floor is `liveSimDays`'s own currency (sim-days), so it
 * scales with the CURRENT time-ladder rate: `deriveSimDays` is affine in
 * `nowMs` for a fixed `time`, so its slope over two wall-clock seconds of
 * healthy poll jitter is the floor at any sampled instant (I4).
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
import { mat3FromColumns } from '../math/mat3FromColumns';
import { normalize3 } from '../math/normalize3';
import { rotateVec3ByTightMat3 } from '../math/rotateVec3ByTightMat3';

const EPOCH_DELTA_TOLERANCE_MS = 2_000;

function sameFrame(a: PoseFrame, b: PoseFrame): boolean {
  if (a === 'absolute' || b === 'absolute') return a === b;
  return a.body === b.body;
}

function wrapRad(rad: number): number {
  return Math.atan2(Math.sin(rad), Math.cos(rad));
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
  readonly gesture: { readonly gesture: SurfaceGesture | null } | null;
  readonly lastZoomFactor: number | null;
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
    let nearestHR = Infinity;
    for (const body of SCENE_BODIES) {
      const id = body.id as BodyId;
      const bodyState = bodyStates.get(id);
      if (bodyState === undefined) continue;
      const candidate = hOverR(eyeMpc, bodyState, body.radiusM);
      if (candidate < nearestHR) {
        nearestHR = candidate;
        bodyId = id;
      }
    }
    hr = bodyId !== null ? nearestHR : null;
  }
  const radiusM =
    bodyId !== null ? SCENE_BODIES.find((row) => row.id === bodyId)?.radiusM : undefined;
  const altitudeM = hr !== null && radiusM !== undefined ? hr * radiusM : null;
  const ceilingRad = hr !== null ? maxTiltRad(hr) : null;

  // ── The orientation pipeline, derived exactly as the live paths derive it ──
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
    // The SAME band-blended reference the engaged settle converges against
    // (`blendedEnuAt` + `refAzimuthOf` — one home each for the frame and the
    // azimuth source rule) — a pole-frame heading here showed non-zero for a
    // converged camera inside the window, misleading the capture. The
    // pose's own up is the carry, exactly as `eyeFrameOf` passes it.
    const sceneUpLocalBody = rotateVec3ByTightMat3T(upRef, bodyState.orientation);
    const forwardLocal: Vec3 = [basisM[6], basisM[7], basisM[8]];
    const upLocal: Vec3 = [basisM[3], basisM[4], basisM[5]];
    const { east, north } = blendedEnuAt(
      localUp,
      hr !== null ? bodyUpWeight(hr) : 1,
      sceneUpLocalBody,
      upLocal,
    );
    const fwdVert =
      forwardLocal[0] * localUp[0] + forwardLocal[1] * localUp[1] + forwardLocal[2] * localUp[2];
    tiltRad = Math.acos(Math.max(-1, Math.min(1, -fwdVert)));
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
    gestureMode: gesture === null ? null : (gesture.gesture?.mode ?? 'down (unlatched)'),
    gestureCursorHit: gesture?.gesture ? gesture.gesture.anchorLocalM !== null : null,
    lastZoomDirection: lastZoomFactor === null ? null : lastZoomFactor < 1 ? 'in' : 'out',
  };
}
