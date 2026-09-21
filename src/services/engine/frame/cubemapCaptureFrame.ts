/**
 * cubemapCaptureFrame — the frame a cubemap capture row derives ONCE, before
 * its six faces turn it (`deriveView(snapshot, cam, faceViewSpec(face, ...))`).
 * The synthetic camera looks along the `axes` frame's −Z with +Y up — the
 * binding to `cubeFaceBases`'s `FACE_VIEW_ROTATIONS` is `faceViewSpec.test.ts`'s
 * parity test, not this comment.
 */

import type { Vec3 } from '../../../@types/math/Vec3';
import type { Mat3 } from '../../../@types/math/Mat3';
import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { CaptureFrame } from '../../../@types/engine/frame/CaptureFrame';
import type { NotReadyFrameContext } from '../../../@types/engine/frame/NotReadyFrameContext';
import { deriveFrameContext } from './frameContext';
import { deriveSourceMasks } from './deriveSourceMasks';
import { assembleOrbitCamera } from '../camera/assembleOrbitCamera';
import { absoluteArm } from '../../../utils/camera/absoluteArm';
import { IDENTITY_MAT3 } from '../../../utils/math/identityMat3';

export function cubemapCaptureFrame(input: {
  readonly state: EngineState;
  readonly eyeMpc: Readonly<Vec3>;
  readonly nearMpc: number;
  readonly nowMs: number;
  /** World-from-cube axes; omitted = world axes. */
  readonly axes?: Readonly<Mat3>;
}): CaptureFrame | NotReadyFrameContext {
  const { state, eyeMpc, nearMpc, nowMs, axes } = input;
  const basis = (axes ?? IDENTITY_MAT3) as Mat3;
  // `updatePosition` decodes local +Z through poseBasis's THIRD column, so
  // the capture camera's world forward is that column negated.
  const forward: Vec3 = [-basis[6], -basis[7], -basis[8]];
  const target: Vec3 = [
    eyeMpc[0] + forward[0] * nearMpc,
    eyeMpc[1] + forward[1] * nearMpc,
    eyeMpc[2] + forward[2] * nearMpc,
  ];
  const pose: CameraPose = { target, yaw: 0, pitch: 0, distance: nearMpc };
  const cam = assembleOrbitCamera(
    pose,
    // 90° symmetric frustum, one cube face; `far` rides the live projection.
    {
      fovYRad: Math.PI / 2,
      aspect: 1,
      near: nearMpc,
      far: state.cameraRuntime.outputs.projection.far,
    },
    basis,
    basis,
  );
  // A capture face's own `renderedTargets` defaults empty — capture steps
  // never union into the frame-wide fact (`executeFrame`'s header).
  const snapshot = deriveFrameContext(state, {
    cam,
    // The capture pose is synthetic and world-absolute, so the pose-provider
    // seam routes every body through the Mpc path — no body arm can be
    // engaged on a face.
    arm: absoluteArm(pose),
    // The synthetic pose orbits no pivot: its altitude is its own distance.
    altitudeMpc: nearMpc,
    nowMs,
    simDays: state.cameraRuntime.outputs.simDays,
    // draw mask: a capture, not a click target. Sampled at the FRAME's nowMs
    // (not the registry's last-ticked clock) so a just-settled fade-out never
    // gets baked into the capture — see `deriveSourceMasks`'s nowMs docblock.
    visibleSourceMask: deriveSourceMasks(state, nowMs).draw,
  });
  if (!snapshot.isReady) return { isReady: false };
  return { isReady: true, snapshot, cam };
}
