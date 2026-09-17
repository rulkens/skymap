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
import type { CameraTuning } from '../../@types/camera/CameraTuning';
import type { FramedCameraPose } from '../../@types/camera/FramedCameraPose';
import type { Mat3 } from '../../@types/math/Mat3';
import type { OrientDeltas } from '../../@types/camera/OrientDeltas';
import type { PoseFrame } from '../../@types/camera/PoseFrame';
import type { SurfaceGesture } from '../../@types/camera/SurfaceGesture';
import type { TerrainHeightAtLookup } from '../../@types/camera/TerrainHeightAtLookup';
import type { TimeState } from '../../@types/time/TimeState';
import { deriveSimDays } from '../time/deriveSimDays';
import { cameraDofAnglesOf } from './cameraDofAnglesOf';
import { bodyUpWeight } from './bodyUpWeight';
import { datumOnlyTerrainHeight } from './datumOnlyTerrainHeight';
import { eyeMpcOf } from './eyeMpcOf';
import { bodyRelativePose } from '../../services/engine/camera/bodyRelativePose';
import { hostOf } from '../../services/engine/camera/rungs/hostOf';
import { isBodyArm } from '../../services/engine/camera/rungs/isBodyArm';
import { isSiteArm } from '../../services/engine/camera/rungs/isSiteArm';
import { sameFrame } from '../../services/engine/camera/rungs/sameFrame';
import { IDENTITY_MAT3 } from '../math/identityMat3';

const EPOCH_DELTA_TOLERANCE_MS = 2_000;

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
  readonly rememberedTiltRad: number;
  /** Input only: the panel reads the live value through the selector, not off this snapshot. */
  readonly tuning: CameraTuning;
  /** `readOrientDeltas()` — measured in the frame loop, never re-derived here. */
  readonly deltas: OrientDeltas;
  /** `SurfaceTileSubsystem.terrainHeightAt`, bound by the caller (engine.ts)
   *  — the eye-to-ground row's source (F3a, spec §8.3). */
  readonly terrainHeightAt: TerrainHeightAtLookup;
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
    rememberedTiltRad,
    tuning,
    deltas,
    terrainHeightAt,
  } = input;
  const renderedFrame = renderedPose.frame;
  const dofs = cameraDofAnglesOf({
    storedFrame,
    worldPose,
    poseBasis,
    upBasis,
    bodyStates,
    rememberedTiltRad,
    tuning,
  });
  const { bodyId, hOverR: hr } = dofs;
  // Altitude over the datum, matching `hOverR`'s own denominator, minus the
  // terrain under the eye (F3a, spec §8.3) — the same `bodyRelativePose`
  // direction `hOverR` itself derives from (basis argument discarded, per
  // that file's own comment: only the direction matters).
  // Only `radiusM` is read below; the terrain term for this row comes from
  // the caller's own `terrainHeightAt`, not `groundRadiusAtM`.
  const datumRadiusM =
    bodyId !== null
      ? hostOf(
          { body: bodyId },
          { bodies: bodyStates, poseBasis, upBasis, terrainHeightAt: datumOnlyTerrainHeight },
        )?.radiusM
      : undefined;
  const engagedBodyState = bodyId !== null ? bodyStates.get(bodyId) : undefined;
  const terrainM =
    bodyId !== null && engagedBodyState !== undefined
      ? terrainHeightAt(
          bodyId,
          bodyRelativePose({
            camPosMpc: eyeMpcOf(worldPose, poseBasis),
            camBasisWorld: IDENTITY_MAT3,
            bodyState: engagedBodyState,
          }).eyeRelBodyM,
        )
      : 0;

  const engagedPose = isBodyArm(renderedPose) ? renderedPose.pose : null;
  const sitePose = isSiteArm(renderedPose) ? renderedPose.pose : null;
  const epochDeltaDays = liveSimDays - lastRenderedSimDays;
  const epochDeltaEpsDays = Math.abs(
    deriveSimDays(time, EPOCH_DELTA_TOLERANCE_MS) - deriveSimDays(time, 0),
  );

  return {
    storedFrame,
    renderedFrame,
    armMismatch: !sameFrame(storedFrame, renderedFrame),
    hOverR: hr,
    altitudeM: hr !== null && datumRadiusM !== undefined ? hr * datumRadiusM - terrainM : null,
    distanceMpc: worldPose.distance,
    orientationFrame,
    bandUpWeight: hr !== null ? bodyUpWeight(hr, tuning) : null,
    rememberedTiltRad,
    dofs,
    deltas,
    lastRenderedSimDays,
    liveSimDays,
    epochDeltaDays,
    epochMismatch: Math.abs(epochDeltaDays) > epochDeltaEpsDays,
    anchorLocalM: engagedPose !== null ? [...engagedPose.anchorLocalM] : null,
    eyeRelAnchorMagM: engagedPose !== null ? Math.hypot(...engagedPose.eyeRelAnchorM) : null,
    sitePose,
    activeDriverId,
    gestureMode: gesture === null ? null : gesture === 'down' ? 'down (unlatched)' : gesture.mode,
    gestureCursorHit: gesture === null || gesture === 'down' ? null : gesture.anchorLocalM !== null,
  };
}
