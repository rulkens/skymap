/**
 * projectLabel — a view-space vector onto the output image (`OutputProjection`),
 * written into `out`. The TS twin of `lib/projectLabel.wesl::projectLabel`.
 * Pinhole maths runs on the ratios `v.xy / v.z`, so it never squares an Mpc
 * magnitude: the WGSL twin sees metre-range anchors (~1e-22 Mpc) whose squares
 * flush to zero in f32.
 */

import type { OutputProjection } from '../../@types/rendering/OutputProjection';
import type { ProjectedLabel } from '../../@types/rendering/ProjectedLabel';
import type { Vec3 } from '../../@types/math/Vec3';

export function projectLabel(v: Readonly<Vec3>, p: OutputProjection, out: ProjectedLabel): void {
  out.up[0] = 0;
  out.up[1] = -1;
  out.visible = v[2] > 0;
  if (!out.visible) {
    out.px[0] = 0;
    out.px[1] = 0;
    out.pxPerRad = 0;
    return;
  }
  const tx = v[0] / v[2];
  const ty = v[1] / v[2];
  out.px[0] = p.centrePx[0] + p.focalPx * tx;
  out.px[1] = p.centrePx[1] - p.focalPx * ty;
  // focalPx · |v| / v.z, the scale across the line of sight at this anchor.
  out.pxPerRad = p.focalPx * Math.hypot(tx, ty, 1);
}
