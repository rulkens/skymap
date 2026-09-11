/**
 * sceneOccluderBodies — resolve THE per-frame set of bodies that can hide
 * something drawn behind them: centre + radius, one entry per body presented
 * as an OPAQUE SPHERE this frame.
 *
 * The set is read off the partitions the `foreground:0` sphere layers
 * themselves consume, bound exactly as those binders bind them
 * (`ctx.drawCamPos`, `ctx.canvasSize.height`, `ctx.fovYRad`). "Drawn" would be
 * the wrong fact: a 1–3 px planet is drawn, as an additive glint, and occludes
 * nothing. Radii are the bare `radiusM` — an atmosphere, ring or lens quad is
 * not opaque.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { Vec3 } from '../../../@types/math/Vec3';
import { bodyApparentDiameterPx } from '../../../utils/scene/bodyApparentDiameterPx';
import { BODY_GLINT_MAX_PX } from './partitionBodiesByPresentation';
import { partitionStarsByResolution, STAR_RESOLVE_PX } from './partitionStarsByResolution';
import { positionedVisibleStars } from './positionedVisibleStars';
import { sceneBodyPartition } from './sceneBodyPartition';
import { sceneBodyStates } from './sceneBodyStates';

export function sceneOccluderBodies(
  state: EngineState,
  ctx: ReadyFrameContext,
): readonly { readonly positionMpc: Readonly<Vec3>; readonly radiusM: number }[] {
  const states = sceneBodyStates(state, ctx);
  const { flat, textured } = sceneBodyPartition(state, ctx);
  const { spheres } = partitionStarsByResolution({
    stars: positionedVisibleStars(state, ctx),
    camPosMpc: ctx.drawCamPos,
    thresholdPx: STAR_RESOLVE_PX,
    viewportHeightPx: ctx.canvasSize.height,
    fovYRad: ctx.fovYRad,
  });

  const occluders: { positionMpc: Readonly<Vec3>; radiusM: number }[] = [];
  for (const body of flat) {
    occluders.push({ positionMpc: states.get(body.id)!.positionMpc, radiusM: body.radiusM });
  }
  for (const body of textured) {
    occluders.push({ positionMpc: states.get(body.id)!.positionMpc, radiusM: body.radiusM });
  }
  for (const star of spheres) {
    occluders.push({ positionMpc: star.positionMpc, radiusM: star.radiusM });
  }

  // Earth sits in neither partition — `earthPass` draws it alone, and it has no
  // glint form, so strictly it is opaque from the slab floor (1 px) up. It
  // still rides the partition's own opacity threshold rather than importing a
  // second constant: under 3 px its disc hides under a pixel of stroke.
  const earth = state.data.bodies.earth;
  if (earth !== null) {
    const positionMpc = states.get(earth.id)!.positionMpc;
    const diameterPx = bodyApparentDiameterPx({
      positionMpc,
      radiusM: earth.radiusM,
      camPosMpc: ctx.drawCamPos,
      viewportHeightPx: ctx.canvasSize.height,
      fovYRad: ctx.fovYRad,
    });
    if (diameterPx >= BODY_GLINT_MAX_PX) occluders.push({ positionMpc, radiusM: earth.radiusM });
  }

  return occluders;
}
