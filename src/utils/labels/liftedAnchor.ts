/**
 * liftedAnchor — where a label above a sphere of `radiusMpc` sits: the view direction turned
 * toward `p.up3` by `lift.radii` angular radii (at most 90°), projected, then pushed along
 * image-up until it stands `lift.minPx · pxScale` above the subject. Turning in 3D rather than
 * lifting on screen keeps the rule valid for a fisheye. Neither step passes `up3`: beyond the
 * zenith a fisheye draws the card upside down, over its subject. Visible only where the full
 * turn would be (a pinhole's turn past view-up is behind the eye). The TS twin of
 * `lib/projectLabel.wesl::liftedAnchor`.
 */

import type { OutputProjection } from '../../@types/rendering/OutputProjection';
import type { ProjectedLabel } from '../../@types/rendering/ProjectedLabel';
import type { Vec3 } from '../../../packages/shared/src/@types/math/Vec3';
import { LIFT_ZENITH_MARGIN_RAD } from '../../data/labels/liftZenithMarginRad';
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
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  dir[0] = v[0] / len;
  dir[1] = v[1] / len;
  dir[2] = v[2] / len;
  const angle = Math.min(
    lift.radii * Math.asin(Math.min(Math.max(radiusMpc / len, 0), 1)),
    Math.PI / 2,
  );
  const floorPx = lift.minPx * p.pxScale;
  projectLabel(dir, p, subject);
  if (!tangentToward(dir, p.up3, tangent)) {
    // Looking along up3: no turn is defined and every push leads past it, so no lift.
    projectLabel(dir, p, out);
    return;
  }
  // The angle left to up3, from its tangent and radial parts: no arccosine near 0.
  const toUp = Math.atan2(
    p.up3[0] * tangent[0] + p.up3[1] * tangent[1] + p.up3[2] * tangent[2],
    p.up3[0] * dir[0] + p.up3[1] * dir[1] + p.up3[2] * dir[2],
  );
  const turn = Math.min(angle, Math.max(toUp - LIFT_ZENITH_MARGIN_RAD, 0));
  turned[0] = Math.cos(angle) * dir[0] + Math.sin(angle) * tangent[0];
  turned[1] = Math.cos(angle) * dir[1] + Math.sin(angle) * tangent[1];
  turned[2] = Math.cos(angle) * dir[2] + Math.sin(angle) * tangent[2];
  projectLabel(turned, p, out);
  const fullTurnVisible = out.visible;
  turned[0] = Math.cos(turn) * dir[0] + Math.sin(turn) * tangent[0];
  turned[1] = Math.cos(turn) * dir[1] + Math.sin(turn) * tangent[1];
  turned[2] = Math.cos(turn) * dir[2] + Math.sin(turn) * tangent[2];
  projectLabel(turned, p, out);
  out.visible &&= fullTurnVisible;
  if (!out.visible) return;
  const moved = subject.visible
    ? Math.sqrt((out.px[0] - subject.px[0]) ** 2 + (out.px[1] - subject.px[1]) ** 2)
    : 0;
  const leftPx = Math.max(toUp - turn - LIFT_ZENITH_MARGIN_RAD, 0) * out.pxPerRad;
  const liftPx = Math.min(Math.max(floorPx - moved, 0), leftPx);
  out.px[0] += out.up[0] * liftPx;
  out.px[1] += out.up[1] * liftPx;
}
