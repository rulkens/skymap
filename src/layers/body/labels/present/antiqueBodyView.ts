/**
 * antiqueBodyView — one body as this frame's camera sees it (`AntiqueBodyView`).
 * Vectors run in body radii from the eye, so f64 keeps the Moon's 1e-14 Mpc scale
 * exact; the pinhole is the drawn view's own frustum, lens shift included, the same
 * one the NEAR0 labels draw through.
 */

import type { FrameView } from '../../../../@types/engine/frame/FrameView';
import type { BodyState } from '../../../../@types/scene/BodyState';
import type { Vec2 } from '../../../../@types/math/Vec2';
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { AntiqueBodyView } from '../@types/AntiqueBodyView';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { viewBasis } from '../../../../utils/camera/projection/viewBasis';
import { projectDirToPx } from '../../../../utils/camera/projection/projectDirToPx';
import { rayThroughPx } from '../../../../utils/camera/projection/rayThroughPx';
import { surfacePointBodyFixed } from '../../../../utils/geo/surfacePointBodyFixed';
import { rotateVec3ByTightMat3 } from '../../../../utils/math/rotateVec3ByTightMat3';
import { normalize3 } from '../../../../utils/math/normalize3';
import { dot3 } from '../../../../utils/math/dot3';

export function antiqueBodyView(
  body: BodyState,
  radiusM: number,
  toSun: Readonly<Vec3>,
  ctx: FrameView,
): AntiqueBodyView {
  const basis = viewBasis(ctx.cam);
  const radiusMpc = radiusM * SCALE_UNITS.M_TO_MPC;
  const radiusKm = radiusM / 1000;
  const eye = ctx.drawCamPos;
  const p = body.positionMpc;
  const centre: Vec3 = [
    (p[0] - eye[0]) / radiusMpc,
    (p[1] - eye[1]) / radiusMpc,
    (p[2] - eye[2]) / radiusMpc,
  ];
  const normal = (latDeg: number, lonDeg: number): Vec3 =>
    rotateVec3ByTightMat3(body.orientation, surfacePointBodyFixed(latDeg, lonDeg, 1));
  const ground = (n: Readonly<Vec3>): Vec3 => [
    centre[0] + n[0],
    centre[1] + n[1],
    centre[2] + n[2],
  ];
  const toPx = (dir: Readonly<Vec3>): Vec2 | null => {
    const hit = projectDirToPx(normalize3(dir), basis, ctx.frustum, ctx.canvasSize);
    return hit ? [hit.x, hit.y] : null;
  };

  return {
    project: (latDeg, lonDeg) => toPx(ground(normal(latDeg, lonDeg))),
    facing: (latDeg, lonDeg) => {
      const n = normal(latDeg, lonDeg);
      return -dot3(n, normalize3(ground(n)));
    },
    sunCos: (latDeg, lonDeg) => dot3(normal(latDeg, lonDeg), toSun),
    pxPerKm: (latDeg, lonDeg) => {
      const g = ground(normal(latDeg, lonDeg));
      return ctx.drawPxPerRad / (Math.hypot(g[0], g[1], g[2]) * radiusKm);
    },
    discCentrePx: toPx(centre),
    // The silhouette's true radius, tan(asin(R/d)): the small-angle R/d puts the limb of
    // a Moon a few radii off ~8% inside where it is drawn.
    discRadiusPx: ctx.drawPxPerRad * Math.tan(Math.asin(Math.min(1, 1 / Math.hypot(...centre)))),
    radiusKm,
    anchorMpc: (xPx, yPx, latDeg, lonDeg) => {
      // `rayThroughPx` has unit forward component, so scaling it by depth lands at depth.
      const depthMpc = dot3(ground(normal(latDeg, lonDeg)), basis.forward) * radiusMpc;
      const ray = rayThroughPx([xPx, yPx], basis, ctx.frustum, ctx.canvasSize);
      return [ray[0] * depthMpc, ray[1] * depthMpc, ray[2] * depthMpc];
    },
  };
}
