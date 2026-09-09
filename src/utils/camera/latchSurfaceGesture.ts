import type { BodyFixedPose } from '../../@types/camera/BodyFixedPose';
import type { DragStep } from '../../@types/camera/DragStep';
import type { SurfaceGesture } from '../../@types/camera/SurfaceGesture';
import type { Vec2 } from '../../@types/math/Vec2';
import type { Vec3 } from '../../@types/math/Vec3';
import { MIN_INCIDENCE_COS } from './anchoredDragRotation';
import { bodyFixedEyeM } from './bodyFixedEyeM';
import { cursorRayBodyLocal } from './cursorRayBodyLocal';
import { pickOnBody } from './pickOnBody';
import { normalize3 } from '../math/normalize3';

export function latchSurfaceGesture(
  arm: BodyFixedPose,
  step: DragStep,
  viewportPx: Readonly<Vec2>,
  fovYRad: number,
  bodyRadiusM: number,
): SurfaceGesture {
  const prevPixel = step.startPx;
  const pick = pickOnBody(cursorRayBodyLocal(arm, prevPixel, viewportPx, fovYRad), bodyRadiusM);

  // The secondary drag (right / middle button) is the tilt handle. Its anchor
  // falls back to the nadir footprint, so tilt always has a ground point to
  // orbit whatever the cursor is over.
  if (step.mode === 'pan') {
    const nadir = normalize3(bodyFixedEyeM(arm));
    const anchorLocalM: Vec3 = pick?.pointM ?? [
      nadir[0] * bodyRadiusM,
      nadir[1] * bodyRadiusM,
      nadir[2] * bodyRadiusM,
    ];
    return { mode: 'tilt', anchorLocalM, anchorRadiusM: Math.hypot(...anchorLocalM), prevPixel };
  }

  // A miss is sky: free look. (R1 deleted the trackball's free rotation, and
  // with it the altitude tiebreak a miss used to consult — a pan that LEAVES
  // the disc mid-gesture degrades to the north-locked orbit instead.)
  if (pick === null) return { mode: 'look', anchorLocalM: null, anchorRadiusM: 0, prevPixel };

  return {
    // At grazing incidence the rotation that satisfies the drag is a teleport,
    // so the gesture strafes in the anchor's plane instead (C §6.4).
    mode: Math.abs(pick.incidence) < MIN_INCIDENCE_COS ? 'strafe' : 'pan',
    anchorLocalM: pick.pointM,
    anchorRadiusM: Math.hypot(...pick.pointM),
    prevPixel,
  };
}
