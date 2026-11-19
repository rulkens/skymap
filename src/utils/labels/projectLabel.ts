/**
 * projectLabel — a view-space vector onto the output image (`OutputProjection`),
 * written into `out`. The TS twin of `lib/projectLabel.wesl::projectLabel`.
 * Neither kind squares an Mpc magnitude (pinhole runs on `v.xy / v.z`, the
 * fisheye on `v` over its largest component): the WGSL twin sees metre-range
 * anchors (~1e-22 Mpc) whose squares flush to zero in f32.
 */

import type { OutputProjection } from '../../@types/rendering/OutputProjection';
import type { ProjectedLabel } from '../../@types/rendering/ProjectedLabel';
import type { Vec3 } from '../../@types/math/Vec3';
import { PARALLEL_TANGENT_EPS } from '../../data/labels/parallelTangentEps';

export function projectLabel(v: Readonly<Vec3>, p: OutputProjection, out: ProjectedLabel): void {
  out.up[0] = 0;
  out.up[1] = -1;
  const equidistant = p.kind === 'equidistant';
  const largest = Math.max(Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2]));
  // The dome frame sees its upper half (+y is the zenith); a pinhole sees +z.
  out.visible = equidistant ? largest > 0 && v[1] >= 0 : v[2] > 0;
  // The fisheye still places a direction under the horizon, outside the circle: a card
  // corner of a label standing on the horizon lands there (`labelCornerPx`).
  if (equidistant ? largest === 0 : !out.visible) {
    out.px[0] = 0;
    out.px[1] = 0;
    out.pxPerRad = 0;
    return;
  }
  if (equidistant) {
    const x = v[0] / largest;
    const z = v[2] / largest;
    const horizontal = Math.sqrt(x * x + z * z);
    out.px[0] = p.centrePx[0];
    out.px[1] = p.centrePx[1];
    out.pxPerRad = p.focalPx;
    // At the zenith no direction leads away from it: the centre, image-up.
    if (horizontal < PARALLEL_TANGENT_EPS) return;
    // Angle from the zenith by atan2: an arccosine loses all precision near it.
    const horizonFraction = Math.atan2(horizontal, v[1] / largest) / (Math.PI / 2);
    // The resample stretches the horizon over the whole canvas, so each axis has its own
    // radius. Front (+z) runs down the image.
    const edgeX = ((p.sizePx[0] / 2) * x) / horizontal;
    const edgeY = ((p.sizePx[1] / 2) * z) / horizontal;
    const edge = Math.sqrt(edgeX * edgeX + edgeY * edgeY);
    out.px[0] += horizonFraction * edgeX;
    out.px[1] += horizonFraction * edgeY;
    // Up points back at the zenith, in px.
    out.up[0] = -edgeX / edge;
    out.up[1] = -edgeY / edge;
    return;
  }
  const tx = v[0] / v[2];
  const ty = v[1] / v[2];
  out.px[0] = p.centrePx[0] + p.focalPx * tx;
  out.px[1] = p.centrePx[1] - p.focalPx * ty;
  // focalPx · |v| / v.z, the scale across the line of sight at this anchor.
  out.pxPerRad = p.focalPx * Math.sqrt(tx * tx + ty * ty + 1);
}
