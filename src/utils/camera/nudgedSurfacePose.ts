import type { ArmDelta } from '../../@types/camera/ArmDelta';
import type { BodyFixedPose } from '../../@types/camera/BodyFixedPose';
import type { SurfaceStepCtx } from '../../@types/camera/SurfaceStepCtx';
import type { TiltMemory } from '../../@types/camera/TiltMemory';
import { lookedSurfacePose } from './lookedSurfacePose';
import { orbitedSurfacePose } from './orbitedSurfacePose';
import { rollBasisAboutView } from './rollBasisAboutView';
import { settledDragPose } from './settledDragPose';
import { surfaceZoomStep } from './surfaceZoomStep';

/**
 * The body arm's pixel-free motion: zoom (anchored at screen centre, settling
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
        );
  let settled = { pose: zoomed, tilt };
  if (orbit !== undefined || look !== undefined) {
    let moved = zoomed;
    if (orbit !== undefined) moved = orbitedSurfacePose(moved, orbit[0], orbit[1]);
    if (look !== undefined) moved = lookedSurfacePose(moved, look[0], look[1]);
    settled = settledDragPose(zoomed, moved, look !== undefined ? 'look' : 'orbit', tilt, ctx);
  }
  if (roll === undefined) return settled;
  const { pose } = settled;
  return { ...settled, pose: { ...pose, basisLocal: rollBasisAboutView(pose.basisLocal, roll) } };
}
