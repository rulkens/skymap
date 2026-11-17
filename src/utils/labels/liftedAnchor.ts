/**
 * liftedAnchor — where a label above a sphere of `radiusMpc` sits: the view direction turned
 * toward `p.up3` by `lift.radii` angular radii (at most 90°), projected, then pushed further
 * along image-up until it stands at least `lift.minPx · pxScale` above the subject. Turning in
 * 3D rather than lifting on screen keeps the rule valid for a fisheye. The TS twin of
 * `lib/projectLabel.wesl::liftedAnchor`.
 */

import type { OutputProjection } from '../../@types/rendering/OutputProjection';
import type { ProjectedLabel } from '../../@types/rendering/ProjectedLabel';
import type { Vec3 } from '../../@types/math/Vec3';
import { projectLabel } from './projectLabel';
import { tangentToward } from './tangentToward';

const dir: Vec3 = [0, 0, 0];
const tangent: Vec3 = [0, 0, 0];
const turned: Vec3 = [0, 0, 0];
const subject: ProjectedLabel = { px: [0, 0], pxPerRad: 0, up: [0, 0], visible: false };

export function liftedAnchor(
  v: Readonly<Vec3>,
  radiusMpc: number,
  lift: { readonly radii: number; readonly minPx: number },
  p: OutputProjection,
  out: ProjectedLabel,
): void {
  const len = Math.hypot(v[0], v[1], v[2]);
  dir[0] = v[0] / len;
  dir[1] = v[1] / len;
  dir[2] = v[2] / len;
  const angle = Math.min(
    lift.radii * Math.asin(Math.min(Math.max(radiusMpc / len, 0), 1)),
    Math.PI / 2,
  );
  const floorPx = lift.minPx * p.pxScale;
  projectLabel(dir, p, subject);
  let liftPx: number;
  if (tangentToward(dir, p.up3, tangent)) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    turned[0] = c * dir[0] + s * tangent[0];
    turned[1] = c * dir[1] + s * tangent[1];
    turned[2] = c * dir[2] + s * tangent[2];
    projectLabel(turned, p, out);
    const moved = subject.visible
      ? Math.hypot(out.px[0] - subject.px[0], out.px[1] - subject.px[1])
      : 0;
    liftPx = Math.max(floorPx - moved, 0);
  } else {
    // Looking along up3: no turn is defined, so the angular lift goes on screen.
    projectLabel(dir, p, out);
    liftPx = Math.max(angle * out.pxPerRad, floorPx);
  }
  if (!out.visible) return;
  out.px[0] += out.up[0] * liftPx;
  out.px[1] += out.up[1] * liftPx;
}
