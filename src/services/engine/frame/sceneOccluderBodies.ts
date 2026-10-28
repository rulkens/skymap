/**
 * sceneOccluderBodies: the per-frame set of bodies that can hide something behind
 * them, one entry per body presented as an OPAQUE SPHERE (every resolved body with
 * a ground `surface`, off `sceneBodyPresentation`). "Drawn" would be wrong: a 1-3 px
 * planet is an additive glint and occludes nothing. Radii are the INNER bound (an
 * occluder must under-occlude). Mesh bodies are deliberately NOT here: they occlude
 * trails through the sampled `foreground:0` depth, and a bounding sphere would
 * over-occlude.
 */

import type { PassState } from '../../../@types/engine/frame/PassState';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { Vec3 } from '../../../@types/math/Vec3';
import { bodyApparentDiameterPx } from '../../../utils/scene/bodyApparentDiameterPx';
import { innerBoundRadiusM } from '../../../utils/occlusion/innerBoundRadiusM';
import { sceneBodyPresentation } from './sceneBodyPresentation';
import { sceneBodyStates } from './sceneBodyStates';
import { SCENE_EARTH } from '../../../data/bodies/sceneEarth';

export function sceneOccluderBodies(
  state: PassState,
  ctx: FrameView,
): readonly { readonly positionMpc: Readonly<Vec3>; readonly radiusM: number }[] {
  const occluders: { positionMpc: Readonly<Vec3>; radiusM: number }[] = [];
  for (const { body, positionMpc } of sceneBodyPresentation(ctx).resolved) {
    if ('surface' in body)
      occluders.push({ positionMpc, radiusM: innerBoundRadiusM(body.surface) });
  }

  // Earth is not a sorted scene body (`earthPass` draws it alone, with no glint form),
  // yet uses its resolve size: under 3 px its disc hides under a pixel of stroke.
  const positionMpc = sceneBodyStates(state, ctx).get(SCENE_EARTH.id)!.positionMpc;
  const radiusM = innerBoundRadiusM(SCENE_EARTH.surface);
  const diameterPx = bodyApparentDiameterPx({
    positionMpc,
    radiusM,
    camPosMpc: ctx.drawCamPos,
    pxPerRad: ctx.drawPxPerRad,
  });
  if (diameterPx >= SCENE_EARTH.resolvePx) occluders.push({ positionMpc, radiusM });

  return occluders;
}
