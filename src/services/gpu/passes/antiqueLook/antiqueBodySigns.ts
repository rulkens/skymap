/**
 * antiqueBodySigns — where the plate stamps a sign for each named body too small to
 * draw as a globe (its glint's place in the plain look): device px, behind-the-eye
 * bodies dropped. Earth rides `SCENE_EARTH`, not the scene-body partition, so it is
 * added here by the same size test.
 */

import type { FrameView } from '../../../../@types/engine/frame/FrameView';
import type { ViewBasis } from '../../../../@types/camera/projection/ViewBasis';
import type { Vec2 } from '../../../../@types/math/Vec2';
import type { Vec3 } from '../../../../@types/math/Vec3';
import { SCENE_EARTH } from '../../../../data/bodies/sceneEarth';
import { projectDirToPx } from '../../../../utils/camera/projection/projectDirToPx';
import { antiqueBodySigned } from '../../../../utils/labels/antiqueBodySigned';
import { innerBoundRadiusM } from '../../../../utils/occlusion/innerBoundRadiusM';
import { bodyApparentDiameterPx } from '../../../../utils/scene/bodyApparentDiameterPx';
import { sceneBodyPresentation } from '../../../engine/frame/sceneBodyPresentation';
import { sceneBodyStates } from '../../../engine/frame/sceneBodyStates';
import type { PassState } from '../../../../@types/engine/frame/PassState';

export function antiqueBodySigns(state: PassState, ctx: FrameView, basis: ViewBasis): Vec2[] {
  const eye = ctx.drawCamPos;
  const at: { id: string; positionMpc: Readonly<Vec3> }[] = sceneBodyPresentation(ctx)
    .unresolved.map(({ body, positionMpc }) => ({ id: body.id, positionMpc }));
  const earth = sceneBodyStates(state, ctx).get(SCENE_EARTH.id)!.positionMpc;
  const earthPx = bodyApparentDiameterPx({
    positionMpc: earth,
    radiusM: innerBoundRadiusM(SCENE_EARTH.surface),
    camPosMpc: eye,
    pxPerRad: ctx.drawPxPerRad,
  });
  if (earthPx < SCENE_EARTH.resolvePx) at.push({ id: SCENE_EARTH.id, positionMpc: earth });

  const signs: Vec2[] = [];
  for (const { id, positionMpc } of at) {
    if (!antiqueBodySigned(id)) continue;
    const d: Vec3 = [positionMpc[0] - eye[0], positionMpc[1] - eye[1], positionMpc[2] - eye[2]];
    const range = Math.hypot(...d);
    const px = projectDirToPx(
      [d[0] / range, d[1] / range, d[2] / range],
      basis,
      ctx.frustum,
      ctx.canvasSize,
    );
    if (px !== null) signs.push([px.x, px.y]);
  }
  return signs;
}
