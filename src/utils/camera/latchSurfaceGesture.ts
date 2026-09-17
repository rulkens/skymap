import type { BodyFixedPose } from '../../@types/camera/BodyFixedPose';
import type { DragStep } from '../../@types/camera/DragStep';
import type { GroundRadiusLookup } from '../../@types/camera/GroundRadiusLookup';
import type { SurfaceGesture } from '../../@types/camera/SurfaceGesture';
import type { Vec2 } from '../../@types/math/Vec2';
import type { Vec3 } from '../../@types/math/Vec3';
import { MIN_INCIDENCE_COS } from './anchoredDragRotation';
import { bodyFixedEyeM } from './bodyFixedEyeM';
import { cursorRayBodyLocal } from './cursorRayBodyLocal';
import { metresPerPixelAtRange } from './metresPerPixelAtRange';
import { pickOnBody } from './pickOnBody';
import { raycastTerrain } from './raycastTerrain';
import { normalize3 } from '../math/normalize3';

export function latchSurfaceGesture(
  arm: BodyFixedPose,
  step: DragStep,
  viewportPx: Readonly<Vec2>,
  fovYRad: number,
  bodyRadiusM: number,
  groundRadiusAtM: GroundRadiusLookup,
  innerBoundRadiusM: number,
  outerBoundRadiusM: number,
): SurfaceGesture {
  const prevPixel = step.startPx;
  const ray = cursorRayBodyLocal(arm, prevPixel, viewportPx, fovYRad);
  const toleranceM = metresPerPixelAtRange(
    Math.hypot(...bodyFixedEyeM(arm)) - bodyRadiusM,
    fovYRad,
    viewportPx[1],
  );
  // "Always answer something" is camera-feel policy, so the datum fallback
  // lives at this call site, not inside the pure marcher (mirrors surfaceZoomStep).
  const pick =
    raycastTerrain(ray, innerBoundRadiusM, outerBoundRadiusM, groundRadiusAtM, toleranceM) ??
    pickOnBody(ray, bodyRadiusM);

  // The secondary drag (right / middle button) is the tilt handle. Its anchor
  // falls back to the nadir footprint, so tilt always has a ground point to
  // orbit whatever the cursor is over — on the resident terrain, not the
  // datum, since `groundRadiusAtM` under the exact nadir direction already
  // IS that footprint with no march required.
  if (step.mode === 'pan') {
    const nadir = normalize3(bodyFixedEyeM(arm));
    const nadirGroundRadiusM = groundRadiusAtM(nadir);
    const anchorLocalM: Vec3 = pick?.pointM ?? [
      nadir[0] * nadirGroundRadiusM,
      nadir[1] * nadirGroundRadiusM,
      nadir[2] * nadirGroundRadiusM,
    ];
    return { mode: 'tilt', anchorLocalM, anchorRadiusM: Math.hypot(...anchorLocalM), prevPixel };
  }

  // A miss is sky: free look (R1). A pan that LEAVES the disc mid-gesture
  // degrades to the north-locked orbit instead, not to look.
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
