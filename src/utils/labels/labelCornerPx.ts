/**
 * labelCornerPx — where one corner of a label's text lands. A flat screen wants flat text: the
 * pinhole corner is the rigid offset along the anchor's up. A fisheye stretches widths by
 * θ / sin θ, so flat text would read condensed on the dome; there each corner sits on a card
 * tangent to the dome at the anchor, upright toward `p.up3`, and is projected on its own.
 * The card's right is `cross(up, dir)`: the fisheye image is the dome seen from inside (front
 * at the bottom, dome +x at image right), so that is the reader's left-to-right.
 * The TS twin of `lib/projectLabel.wesl::labelCornerPx`.
 */

import type { OutputProjection } from '../../@types/rendering/OutputProjection';
import type { ProjectedLabel } from '../../@types/rendering/ProjectedLabel';
import type { Vec2 } from '../../../packages/shared/src/@types/math/Vec2';
import type { Vec3 } from '../../../packages/shared/src/@types/math/Vec3';
import { projectLabel } from './projectLabel';
import { tangentToward } from './tangentToward';
import { unprojectLabel } from './unprojectLabel';

const dir: Vec3 = [0, 0, 0];
const cardUp: Vec3 = [0, 0, 0];
const onCard: Vec3 = [0, 0, 0];
const corner: ProjectedLabel = { px: [0, 0], pxPerRad: 0, up: [0, 0], visible: false };

/** Where a point `offsetPx` from a label's anchor lands on the image: x along the text,
 *  y toward the label's up, in output px at the anchor. Written into `out`. */
export function labelCornerPx(
  anchor: ProjectedLabel,
  offsetPx: Readonly<Vec2>,
  p: OutputProjection,
  out: Vec2,
): void {
  const [x, y] = offsetPx;
  if (p.kind !== 'equidistant') {
    out[0] = anchor.px[0] - anchor.up[1] * x + anchor.up[0] * y;
    out[1] = anchor.px[1] + anchor.up[0] * x + anchor.up[1] * y;
    return;
  }
  unprojectLabel(anchor.px, p, dir);
  if (!tangentToward(dir, p.up3, cardUp)) {
    // At the zenith the card's up is image-up, which is the dome's back (−z).
    cardUp[0] = 0;
    cardUp[1] = 0;
    cardUp[2] = -1;
  }
  const rightX = cardUp[1] * dir[2] - cardUp[2] * dir[1];
  const rightY = cardUp[2] * dir[0] - cardUp[0] * dir[2];
  const rightZ = cardUp[0] * dir[1] - cardUp[1] * dir[0];
  // Card px over px per radian: the tangent-plane offset at unit distance.
  onCard[0] = dir[0] + (rightX * x + cardUp[0] * y) / p.focalPx;
  onCard[1] = dir[1] + (rightY * x + cardUp[1] * y) / p.focalPx;
  onCard[2] = dir[2] + (rightZ * x + cardUp[2] * y) / p.focalPx;
  projectLabel(onCard, p, corner);
  out[0] = corner.px[0];
  out[1] = corner.px[1];
}
