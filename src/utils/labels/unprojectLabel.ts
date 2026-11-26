/**
 * unprojectLabel — the unit view direction that `projectLabel` sends to `px`, written into
 * `out`: the inverse `labelCornerPx` needs to stand a card at an anchor that was pushed in px.
 * The TS twin of `lib/projectLabel.wesl::unprojectLabel`.
 */

import type { OutputProjection } from '../../@types/rendering/OutputProjection';
import type { Vec2 } from '../../@types/math/Vec2';
import type { Vec3 } from '../../@types/math/Vec3';

/** The unit view direction that `projectLabel` sends to `px`. */
export function unprojectLabel(px: Readonly<Vec2>, p: OutputProjection, out: Vec3): void {
  if (p.kind === 'equidistant') {
    // Fractions of the horizon radius, one radius per axis as the resample stretches it.
    const x = (px[0] - p.centrePx[0]) / (p.sizePx[0] / 2);
    const z = (px[1] - p.centrePx[1]) / (p.sizePx[1] / 2);
    const horizonFraction = Math.sqrt(x * x + z * z);
    if (horizonFraction === 0) {
      out[0] = 0;
      out[1] = 1;
      out[2] = 0;
      return;
    }
    const fromZenith = horizonFraction * (Math.PI / 2);
    const horizontal = Math.sin(fromZenith) / horizonFraction;
    out[0] = horizontal * x;
    out[1] = Math.cos(fromZenith);
    out[2] = horizontal * z;
    return;
  }
  const tx = (px[0] - p.centrePx[0]) / p.focalPx;
  const ty = (p.centrePx[1] - px[1]) / p.focalPx;
  const len = Math.sqrt(tx * tx + ty * ty + 1);
  out[0] = tx / len;
  out[1] = ty / len;
  out[2] = 1 / len;
}
