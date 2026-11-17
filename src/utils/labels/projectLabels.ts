/**
 * projectLabels — projects every label's anchor to output px (+Y down), once
 * per frame, through `projectLabel` — the function the label shader runs too —
 * and lifts a `lift`ed label's anchor by `labelLiftPx`, as the shader does.
 * The ONE projection walk for the two consumers that must agree on where a
 * label sits on screen — the COSMO/NEAR0 declutter arms and the pick-quad
 * emitter — so a label can't be decluttered against one screen position and
 * clicked at another.
 */

import type { Label2D } from '../../@types/rendering/Label2D';
import type { Label2DProjected } from '../../@types/rendering/Label2DProjected';
import type { Label2DProjection } from '../../@types/rendering/Label2DProjection';
import type { LabelBBox } from '../../@types/rendering/LabelBBox';
import type { ProjectedLabel } from '../../@types/rendering/ProjectedLabel';
import type { Vec3 } from '../../@types/math/Vec3';
import { ATLAS_FONT_SIZE } from '../../data/fonts';
import { projectLabel } from './projectLabel';
import { labelDisplayEmPx } from './labelDisplayEmPx';
import { labelLiftPx } from './labelLiftPx';

const view: Vec3 = [0, 0, 0];
const scratch: ProjectedLabel = { px: [0, 0], pxPerRad: 0, up: [0, 0], visible: false };

export function projectLabels(
  labels: readonly Label2D[],
  projection: Label2DProjection,
  /** Null leaves every anchor at its subject (NEAR0's declutter rule). */
  measure: ((label: Label2D) => LabelBBox | null) | null,
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
    if (!scratch.visible) {
      return { screenPx: null, clipW: view[2], onScreen: false, subjectSizePx: 0 };
    }
    let [px, py] = scratch.px;
    // Apparent diameter on the axis's scale, as `apparentSizePx` reads it.
    const subjectSizePx = label.lift
      ? ((2 * label.lift.radiusMpc) / Math.hypot(view[0], view[1], view[2])) * output.focalPx
      : 0;
    if (label.lift && measure) {
      const emToPx = labelDisplayEmPx(label, view[2], output.focalPx) / ATLAS_FONT_SIZE;
      const liftPx = labelLiftPx(subjectSizePx, (measure(label)?.maxY ?? 0) * emToPx);
      px += scratch.up[0] * liftPx;
      py += scratch.up[1] * liftPx;
    }
    return {
      screenPx: [px, py],
      clipW: view[2],
      onScreen: px >= 0 && px <= width && py >= 0 && py <= height,
      subjectSizePx,
    };
  });
}
