import type { ArmDelta } from '../../../../@types/ArmDelta';
import type { BodyFixedPose } from '../../../../../../../@types/camera/pose/BodyFixedPose';
import type { SurfaceStepCtx } from '../../@types/SurfaceStepCtx';
import type { TiltMemory } from '../../../../../../../@types/camera/orientation/TiltMemory';
import { lookedSurfacePose } from './lookedSurfacePose';
import { orbitedSurfacePose } from './orbitedSurfacePose';
import { rollBasisAboutView } from '../../../../orientation/utils/rollBasisAboutView';
import { settledDragPose } from './settledDragPose';
import { surfaceOrbitScale } from './surfaceOrbitScale';
import { surfaceZoomStep } from './surfaceZoomStep';

/**
 * The body arm's pixel-free motion: zoom (anchored at the optical centre, settling
 * itself) → orbit → look, then ONE drag settle, then roll. Roll is applied
 * after the settle, which would level it away; it moves no eye and keeps
 * forward, so neither the floor nor the tilt memory would have seen it.
 */
export function nudgedSurfacePose(
  arm: BodyFixedPose,
  tilt: TiltMemory,
  delta: ArmDelta,
  ctx: SurfaceStepCtx,
): { readonly pose: BodyFixedPose; readonly tilt: TiltMemory } {
  const { orbit, look, zoom, roll } = delta;
  const zoomed =
    zoom === undefined
      ? arm
      : surfaceZoomStep(
          arm,
          null,
          Math.exp(zoom),
          null,
          ctx.viewportPx,
          ctx.frustum,
          ctx.fovYRad,
          ctx.bodyRadiusM,
          ctx.standoffRadii,
          ctx.groundRadiusAtM,
          ctx.innerBoundRadiusM,
          ctx.outerBoundRadiusM,
          ctx.sceneUpLocal,
          tilt.rememberedTiltRad,
          ctx.tuning,
          ctx.focusPivotM,
        ).pose;
  let settled = { pose: zoomed, tilt };
  if (orbit !== undefined || look !== undefined) {
    let moved = zoomed;
    if (orbit !== undefined) {
      const s = surfaceOrbitScale(moved, ctx.fovYRad, ctx.groundRadiusAtM);
      moved = orbitedSurfacePose(moved, orbit[0] * s, orbit[1] * s);
    }
    if (look !== undefined) moved = lookedSurfacePose(moved, look[0], look[1]);
    settled = settledDragPose(zoomed, moved, look !== undefined ? 'look' : 'orbit', tilt, ctx);
  }
  if (roll === undefined) return settled;
  const { pose } = settled;
  return { ...settled, pose: { ...pose, basisLocal: rollBasisAboutView(pose.basisLocal, roll) } };
}
