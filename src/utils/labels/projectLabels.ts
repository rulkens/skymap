/**
 * projectLabels — projects every label's anchor to output px (+Y down), once
 * per frame, through `projectLabel` — the function the label shader runs too.
 * The ONE projection walk for the two consumers that must agree on where a
 * label sits on screen — the COSMO/NEAR0 declutter arms and the pick-quad
 * emitter — so a label can't be decluttered against one screen position and
 * clicked at another.
 */

import type { Label2D } from '../../@types/rendering/Label2D';
import type { Label2DProjected } from '../../@types/rendering/Label2DProjected';
import type { Label2DProjection } from '../../@types/rendering/Label2DProjection';
import type { ProjectedLabel } from '../../@types/rendering/ProjectedLabel';
import type { Vec3 } from '../../@types/math/Vec3';
import { projectLabel } from './projectLabel';

const view: Vec3 = [0, 0, 0];
const scratch: ProjectedLabel = { px: [0, 0], pxPerRad: 0, up: [0, 0], visible: false };

export function projectLabels(
  labels: readonly Label2D[],
  projection: Label2DProjection,
): Label2DProjected[] {
  const { viewFromSlab: m, output } = projection;
  const [width, height] = output.sizePx;
  return labels.map((label) => {
    const [x, y, z] = label.worldPos;
    view[0] = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!;
    view[1] = m[1]! * x + m[5]! * y + m[9]! * z + m[13]!;
    view[2] = m[2]! * x + m[6]! * y + m[10]! * z + m[14]!;
    projectLabel(view, output, scratch);
    // `clipW` is the view depth the clip-space path divided by.
    if (!scratch.visible) return { screenPx: null, clipW: view[2], onScreen: false };
    const [px, py] = scratch.px;
    return {
      screenPx: [px, py],
      clipW: view[2],
      onScreen: px >= 0 && px <= width && py >= 0 && py <= height,
    };
  });
}
