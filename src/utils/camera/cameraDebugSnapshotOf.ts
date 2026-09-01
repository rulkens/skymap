/**
 * cameraDebugSnapshotOf — pure projection for the DebugPanel's "Camera"
 * section. Takes the same primitives `runFrame`'s fold and `regimeArmFor`
 * already resolve (never recomputes the regime itself) and adds the two
 * cross-checks the camera-pivot branch needs watched: stored vs. rendered
 * arm, and rendered vs. live epoch.
 *
 * `EPOCH_DELTA_EPS_DAYS` bounds the gap a HEALTHY live-ticking scene shows
 * between "what the last frame drew" and "what the clock reads right now":
 * the idle heartbeat (`LIVE_IDLE_TICK_MS`, 500 ms) plus this readout's own
 * poll jitter. A stalled loop (dropped `requestRender`, a stuck driver)
 * separates the two by seconds, not milliseconds — two orders of magnitude
 * above the floor, so the threshold doesn't need tuning to the heartbeat.
 */

import type { BodyId } from '../../@types/data/body/BodyId';
import type { BodyState } from '../../@types/scene/BodyState';
import type { CameraDebugSnapshot } from '../../@types/camera/CameraDebugSnapshot';
import type { FramedCameraPose } from '../../@types/camera/FramedCameraPose';
import type { PoseFrame } from '../../@types/camera/PoseFrame';
import type { Vec3 } from '../../@types/math/Vec3';
import { SCENE_BODIES } from '../../data/bodies/sceneBodies';
import { hOverR } from '../../services/engine/camera/regimeArmFor';

const EPOCH_DELTA_EPS_DAYS = 2 / 86_400;

function sameFrame(a: PoseFrame, b: PoseFrame): boolean {
  if (a === 'absolute' || b === 'absolute') return a === b;
  return a.body === b.body;
}

export function cameraDebugSnapshotOf(input: {
  readonly storedFrame: PoseFrame;
  readonly renderedPose: FramedCameraPose;
  readonly eyeMpc: Readonly<Vec3>;
  readonly bodyStates: ReadonlyMap<BodyId, BodyState>;
  readonly lastRenderedSimDays: number;
  readonly liveSimDays: number;
  readonly activeDriverId: string;
}): CameraDebugSnapshot {
  const {
    storedFrame,
    renderedPose,
    eyeMpc,
    bodyStates,
    lastRenderedSimDays,
    liveSimDays,
    activeDriverId,
  } = input;
  const renderedFrame = renderedPose.frame;

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
  const altitudeKm = hr !== null && radiusM !== undefined ? (hr * radiusM) / 1000 : null;

  const engagedPose = renderedFrame !== 'absolute' ? renderedPose.pose : null;
  const anchorLocalKm: Vec3 | null =
    engagedPose !== null
      ? [
          engagedPose.anchorLocalM[0] / 1000,
          engagedPose.anchorLocalM[1] / 1000,
          engagedPose.anchorLocalM[2] / 1000,
        ]
      : null;
  const eyeRelAnchorMagM = engagedPose !== null ? Math.hypot(...engagedPose.eyeRelAnchorM) : null;

  const epochDeltaDays = liveSimDays - lastRenderedSimDays;

  return {
    storedFrame,
    renderedFrame,
    armMismatch: !sameFrame(storedFrame, renderedFrame),
    engagedBodyId: bodyId,
    hOverR: hr,
    altitudeKm,
    lastRenderedSimDays,
    liveSimDays,
    epochDeltaDays,
    epochMismatch: Math.abs(epochDeltaDays) > EPOCH_DELTA_EPS_DAYS,
    anchorLocalKm,
    eyeRelAnchorMagM,
    activeDriverId,
  };
}
