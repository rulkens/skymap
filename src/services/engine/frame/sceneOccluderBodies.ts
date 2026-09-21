/**
 * sceneOccluderBodies — resolve THE per-frame set of bodies that can hide
 * something drawn behind them: centre + radius, one entry per body presented
 * as an OPAQUE SPHERE this frame.
 *
 * The set is read off the partitions the `foreground:0` sphere layers
 * themselves consume, bound exactly as those binders bind them
 * (`ctx.drawCamPos`, `ctx.drawPxPerRad`). "Drawn" would be
 * the wrong fact: a 1–3 px planet is drawn, as an additive glint, and occludes
 * nothing. Radii are the INNER bound — an occluder must under-occlude; an
 * atmosphere, ring or lens quad is not opaque. For a mesh body it is the bake's
 * BOUNDING sphere, so the whale's elongated silhouette hides more than it covers.
 */

import type { PassState } from '../../../@types/engine/frame/PassState';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { Vec3 } from '../../../@types/math/Vec3';
import { bodyApparentDiameterPx } from '../../../utils/scene/bodyApparentDiameterPx';
import { innerBoundRadiusM } from '../../../utils/occlusion/innerBoundRadiusM';
import { BODY_GLINT_MAX_PX } from './partitionBodiesByPresentation';
import { partitionStarsByResolution, STAR_RESOLVE_PX } from './partitionStarsByResolution';
import { positionedVisibleStars } from './positionedVisibleStars';
import { sceneBodyPartition } from './sceneBodyPartition';
import { sceneBodyStates } from './sceneBodyStates';

export function sceneOccluderBodies(
  state: PassState,
  ctx: FrameView,
): readonly { readonly positionMpc: Readonly<Vec3>; readonly radiusM: number }[] {
  const states = sceneBodyStates(state, ctx);
  const { flat, textured, meshes } = sceneBodyPartition(state, ctx);
  const { spheres } = partitionStarsByResolution({
    stars: positionedVisibleStars(state, ctx),
    camPosMpc: ctx.drawCamPos,
    thresholdPx: STAR_RESOLVE_PX,
    pxPerRad: ctx.drawPxPerRad,
  });

  const occluders: { positionMpc: Readonly<Vec3>; radiusM: number }[] = [];
  for (const body of flat) {
    occluders.push({
      positionMpc: states.get(body.id)!.positionMpc,
      radiusM: innerBoundRadiusM(body.surface),
    });
  }
  for (const body of textured) {
    occluders.push({
      positionMpc: states.get(body.id)!.positionMpc,
      radiusM: innerBoundRadiusM(body.surface),
    });
  }
  // Mesh bodies carry a second gate `drawableMeshBodies` also applies: inside
  // the load radius but not yet decoded, the body draws nothing, and an
  // occluder that draws nothing punches a hole in whatever crosses it.
  const meshRenderer = state.gpu.meshBodyRenderer;
  for (const body of meshes) {
    if (!(meshRenderer?.hasMesh(body.id) ?? false)) continue;
    occluders.push({
      positionMpc: states.get(body.id)!.positionMpc,
      radiusM: body.boundingRadiusM,
    });
  }
  for (const star of spheres) {
    occluders.push({ positionMpc: star.positionMpc, radiusM: innerBoundRadiusM(star.surface) });
  }

  // Earth sits in neither partition — `earthPass` draws it alone, and it has no
  // glint form, so strictly it is opaque from the slab floor (1 px) up. It
  // still rides the partition's own opacity threshold rather than importing a
  // second constant: under 3 px its disc hides under a pixel of stroke.
  const earth = state.data.bodies.earth;
  if (earth !== null) {
    const positionMpc = states.get(earth.id)!.positionMpc;
    const radiusM = innerBoundRadiusM(earth.surface);
    const diameterPx = bodyApparentDiameterPx({
      positionMpc,
      radiusM,
      camPosMpc: ctx.drawCamPos,
      pxPerRad: ctx.drawPxPerRad,
    });
    if (diameterPx >= BODY_GLINT_MAX_PX) occluders.push({ positionMpc, radiusM });
  }

  return occluders;
}
