/**
 * channelSpace — the single canonical home for the Channel→Space mapping and
 * the `lerpInSpace` scalar interpolator the evaluator uses per channel.
 *
 * ### Why one module, not one-file-per-function?
 *
 * The `CHANNEL_SPACE` record and `lerpInSpace` are *inseparable*: every call
 * site that interpolates a channel value needs both — the record to look up
 * which space the channel lives in, and the function to carry out the
 * interpolation in that space. Splitting them into two files would require any
 * consumer of `lerpInSpace` to also import `CHANNEL_SPACE` from a sibling, and
 * any consumer of `CHANNEL_SPACE` that does interpolation would be incomplete
 * without `lerpInSpace`. The cohesion is tighter than the one-export-per-file
 * rule requires, so this is an intentional exception (the same reasoning that
 * keeps, say, `cameraClock.ts`'s factory + helpers in one file).
 *
 * ### Why is CHANNEL_SPACE in exactly one place?
 *
 * Two consumers read it:
 *   1. `lerpInSpace` below — to default to the canonical space for a channel.
 *   2. The clip compiler / validator — to verify that an author-supplied
 *      `space` override is consistent with the channel's natural manifold.
 *
 * If each consumer restated the mapping, a future channel addition would require
 * updating N copies in sync. A single `Record<Channel, Space>` eliminates that
 * drift: add the channel once, everywhere follows.
 *
 * ### Imports
 *
 * This module is purposely minimal — it only depends on the `lerp` primitive
 * and the two type aliases it serves. It has no engine-level deps, making it
 * safe to import from tests, the compiler, and the runtime evaluator alike.
 */

import type { Channel } from '../../../@types/animation/Channel';
import type { Space } from '../../../@types/animation/Space';
import { lerp } from '../../../utils/math/lerp';

/**
 * CHANNEL_SPACE — the canonical Channel → Space mapping.
 *
 * `distance` lives in log space (multiplicative — zooming 1→100 Mpc should
 * feel perceptually uniform, not linear). `yaw` and `pitch` are additive angle
 * offsets (plain lerp + optional shortest-arc correction at the call site).
 * `target` is a Cartesian world-space coordinate and interpolates linearly.
 *
 * This is the ONLY place this mapping is stated. The clip compiler, the
 * evaluator, and the authoring helpers all import it from here — they never
 * restate it.
 */
export const CHANNEL_SPACE: Record<Channel, Space> = {
  distance: 'log',
  yaw: 'add',
  pitch: 'add',
  target: 'lin',
};

/**
 * lerpInSpace — scalar interpolation in the given value space.
 *
 * Dispatches to the correct arithmetic for each space:
 *
 *   - `'log'`: geometric interpolation — `exp(lerp(ln(from), ln(to), t))`.
 *     The midpoint at t=0.5 is the geometric mean `sqrt(from * to)`, not the
 *     arithmetic mean. Used for `distance` where "halfway" should feel
 *     perceptually uniform on a log scale. Requires `from > 0` and `to > 0`
 *     (camera distance is always positive).
 *
 *   - `'add'` / `'lin'`: plain linear interpolation via `lerp(from, to, t)`.
 *     Both are the same arithmetic; the distinction in `Space` exists so the
 *     type carries intent (additive angle vs. Cartesian coordinate) even when
 *     the runtime path is identical.
 *
 * This helper operates on *scalars*. The Vec3 `target` channel is handled
 * component-wise at the evaluator call site — one `lerpInSpace('lin', …)` call
 * per component.
 *
 * @param space  The interpolation space (from `CHANNEL_SPACE` or an override).
 * @param from   The start value.
 * @param to     The end value.
 * @param t      Linear progress in [0, 1]. Values outside are passed through
 *               to `lerp` unclamped (lerp itself does not clamp; ease functions
 *               do — clamping belongs at the easing layer, not here).
 * @returns      Interpolated scalar in the given space.
 */
export function lerpInSpace(space: Space, from: number, to: number, t: number): number {
  if (space === 'log') {
    // Geometric interpolation: exp(lerp(ln(from), ln(to), t)).
    // ln of 0 or negative is -Infinity / NaN — camera distance is always
    // positive, so this is safe for the distance channel in practice.
    return Math.exp(lerp(Math.log(from), Math.log(to), t));
  }
  // 'add' and 'lin' are both plain linear interpolation.
  return lerp(from, to, t);
}
