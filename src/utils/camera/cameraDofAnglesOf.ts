/**
 * cameraDofAnglesOf — heading / tilt / roll as current-target-residual rows,
 * derived through the SAME helpers the live settle uses so the readout cannot
 * drift from the mechanism: heading in the band-blended reference the engaged
 * settle converges against (its target is 0 — north), tilt against ruling 12's
 * `remembered × w(h/R)` mapping, roll against the band's ride target. Targets
 * are field properties and stay derived while `ORIENT_TUNING.northUp` is off:
 * a target moving under a still pose is the reference-frame bug, visible only
 * if it is still on screen. ONE derivation home — the 4 Hz debug snapshot and
 * `runFrame`'s per-frame delta record both read THIS.
 */

import type { BodyId } from '../../@types/data/body/BodyId';
import type { BodyState } from '../../@types/scene/BodyState';
import type { CameraDofAngles } from '../../@types/camera/CameraDofAngles';
import type { CameraDofRow } from '../../@types/camera/CameraDofRow';
import type { CameraPose } from '../../@types/camera/CameraPose';
import type { Mat3 } from '../../@types/math/Mat3';
import type { PoseFrame } from '../../@types/camera/PoseFrame';
import type { Vec3 } from '../../@types/math/Vec3';
import { SCENE_BODIES } from '../../data/bodies/sceneBodies';
import { hOverR } from '../../services/engine/camera/hOverR';
import { nearestBodyHR } from '../../services/engine/camera/nearestBodyHR';
import { bandRollTarget } from '../../services/engine/camera/frameAlignedRoll';
import { bodyRelativePose } from '../../services/engine/camera/bodyRelativePose';
import { blendedEnuAt } from './blendedEnuAt';
import { bodyUpWeight } from './bodyUpWeight';
import { eyeMpcOf } from './eyeMpcOf';
import { frameUp } from './frameUp';
import { imagePlaneBasis } from './imagePlaneBasis';
import { mappedTiltRad } from './mappedTiltRad';
import { refAzimuthOf } from './refAzimuthOf';
import { tiltFromNadirRad } from './tiltFromNadirRad';
import { mat3FromColumns } from '../math/mat3FromColumns';
import { normalize3 } from '../math/normalize3';
import { rotateVec3ByTightMat3T } from '../math/rotateVec3ByTightMat3T';
import { wrapRad } from '../math/wrapRad';

const ABSENT: CameraDofRow = { currentRad: null, targetRad: null, residualRad: null };

function rowOf(currentRad: number | null, targetRad: number | null): CameraDofRow {
  if (currentRad === null || targetRad === null)
    return { currentRad, targetRad, residualRad: null };
  return { currentRad, targetRad, residualRad: wrapRad(currentRad - targetRad) };
}

export function cameraDofAnglesOf(input: {
  readonly storedFrame: PoseFrame;
  readonly worldPose: CameraPose;
  readonly poseBasis: Readonly<Mat3>;
  readonly upBasis: Readonly<Mat3>;
  readonly bodyStates: ReadonlyMap<BodyId, BodyState>;
  readonly rememberedTiltRad: number;
}): CameraDofAngles {
  const { storedFrame, worldPose, poseBasis, upBasis, bodyStates, rememberedTiltRad } = input;
  const eyeMpc = eyeMpcOf(worldPose, poseBasis);

  // Engaged body wins outright (spec's own regime predicate: `storedFrame` IS
  // the regime); the roster-wide nearest is only a stand-in for the "where's
  // the hysteresis band?" question while flying free in the absolute arm.
  let bodyId: BodyId | null = storedFrame !== 'absolute' ? storedFrame.body : null;
  let hr: number | null = null;
  if (bodyId !== null) {
    const engaged = bodyStates.get(bodyId);
    const body = SCENE_BODIES.find((row) => row.id === bodyId);
    if (engaged !== undefined && body !== undefined) hr = hOverR(eyeMpc, engaged, body.radiusM);
  } else {
    const nearest = nearestBodyHR(eyeMpc, bodyStates);
    if (nearest !== null) {
      bodyId = nearest.bodyId;
      hr = nearest.hr;
    }
  }

  const rollRad = worldPose.roll ?? 0;
  const forwardRaw: Vec3 = [
    worldPose.target[0] - eyeMpc[0],
    worldPose.target[1] - eyeMpc[1],
    worldPose.target[2] - eyeMpc[2],
  ];
  const degenerate = Math.hypot(...forwardRaw) === 0;
  const bodyState = bodyId !== null ? bodyStates.get(bodyId) : undefined;

  let heading = ABSENT;
  let tilt = ABSENT;
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
    heading = rowOf(refAzimuthOf(localUp, forwardLocal, upLocal, east, north), 0);
    tilt = rowOf(
      tiltFromNadirRad(forwardLocal, eyeRelBodyM),
      hr !== null ? mappedTiltRad(rememberedTiltRad, hr) : null,
    );
  }

  return {
    bodyId,
    hOverR: hr,
    heading,
    tilt,
    roll: rowOf(
      rollRad,
      degenerate ? null : bandRollTarget(worldPose, bodyStates, poseBasis, upBasis),
    ),
  };
}
