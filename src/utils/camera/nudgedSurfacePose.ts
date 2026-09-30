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
 * itself) → orbit → look → roll, then ONE drag settle. Roll takes the
 * floor-only branch because the level step would undo it: the body arm rules
 * that no DRAG may roll, and a nudge is not a drag.
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
  if (orbit === undefined && look === undefined && roll === undefined)
    return { pose: zoomed, tilt };
  let moved = zoomed;
  if (orbit !== undefined) moved = orbitedSurfacePose(moved, orbit[0], orbit[1]);
  if (look !== undefined) moved = lookedSurfacePose(moved, look[0], look[1]);
  if (roll !== undefined)
    moved = { ...moved, basisLocal: rollBasisAboutView(moved.basisLocal, roll) };
  // 'strafe' is the settle's floor-only branch: no level, no tilt write.
  const mode = roll !== undefined ? 'strafe' : look !== undefined ? 'look' : 'orbit';
  return settledDragPose(zoomed, moved, mode, tilt, ctx);
}
