/**
 * sceneOccluderBodies — resolve THE per-frame set of bodies that can hide
 * something drawn behind them: centre + radius, one entry per body presented
 * as an OPAQUE SPHERE this frame.
 *
 * The set is read off the frame's one scene-body sort, bound as every sphere
 * pass binds it (`sceneBodyPresentation`): every resolved body with a ground
 * `surface` (the resolved planets and star spheres). "Drawn" would be the
 * wrong fact: a 1–3 px planet is drawn, as an additive glint, and occludes
 * nothing. Radii are the INNER bound — an occluder must under-occlude; an
 * atmosphere, ring or lens quad is not opaque. Mesh bodies have no surface and
 * are deliberately NOT in this set: they occlude trails through the sampled
 * `foreground:0` depth, their real silhouette, and a bounding sphere would
 * over-occlude (hide the trail across a disc around the mesh).
 */

import type { PassState } from '../../../@types/engine/frame/PassState';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { Vec3 } from '../../../@types/math/Vec3';
import { bodyApparentDiameterPx } from '../../../utils/scene/bodyApparentDiameterPx';
import { innerBoundRadiusM } from '../../../utils/occlusion/innerBoundRadiusM';
import { sceneBodyPresentation } from './sceneBodyPresentation';
import { sceneBodyStates } from './sceneBodyStates';

export function sceneOccluderBodies(
  state: PassState,
  ctx: FrameView,
): readonly { readonly positionMpc: Readonly<Vec3>; readonly radiusM: number }[] {
  const occluders: { positionMpc: Readonly<Vec3>; radiusM: number }[] = [];
  for (const { body, positionMpc } of sceneBodyPresentation(ctx).resolved) {
    if ('surface' in body)
      occluders.push({ positionMpc, radiusM: innerBoundRadiusM(body.surface) });
  }

  // Earth is not a sorted scene body — `earthPass` draws it alone, and it has no
  // glint form, so strictly it is opaque from the slab floor (1 px) up. It still
  // rides its own resolve size: under 3 px its disc hides under a pixel of stroke.
  const earth = state.data.bodies.earth;
  if (earth !== null) {
    const positionMpc = sceneBodyStates(state, ctx).get(earth.id)!.positionMpc;
    const radiusM = innerBoundRadiusM(earth.surface);
    const diameterPx = bodyApparentDiameterPx({
      positionMpc,
      radiusM,
      camPosMpc: ctx.drawCamPos,
      pxPerRad: ctx.drawPxPerRad,
    });
    if (diameterPx >= earth.resolvePx) occluders.push({ positionMpc, radiusM });
  }

  return occluders;
}
