/**
 * easedShiftNdc — one frame of the lens shift's exponential approach to its
 * target. In NDC, so a resize or rotation mid-ease stays continuous; a pure
 * function of its inputs, so the recorder stays deterministic.
 */

import type { Vec2 } from '../../../../../@types/math/Vec2';
import { LENS_SHIFT_EASE_TAU_MS } from '../data/lensShiftEaseTauMs';

// Frames stop once the shift settles, so the frame a cover change wakes can
// follow seconds of idle; uncapped, that gap would read as a finished ease.
const DT_CAP_MS = 1000 / 30;
// Under a ten-thousandth of NDC (a fraction of a pixel) the ease lands, so
// the caller's settled test is plain equality with the target.
const SETTLED_NDC = 1e-4;

export function easedShiftNdc(current: Readonly<Vec2>, target: Readonly<Vec2>, dtMs: number): Vec2 {
  const k = 1 - Math.exp(-Math.min(Math.max(dtMs, 0), DT_CAP_MS) / LENS_SHIFT_EASE_TAU_MS);
  const x = current[0] + (target[0] - current[0]) * k;
  const y = current[1] + (target[1] - current[1]) * k;
  return Math.abs(target[0] - x) < SETTLED_NDC && Math.abs(target[1] - y) < SETTLED_NDC
    ? [target[0], target[1]]
    : [x, y];
}
