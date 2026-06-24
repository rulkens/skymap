/**
 * ease — the runtime easing table for clip animation segments.
 *
 * `EASE` is a `Record<Ease, (t: number) => number>` that maps each named ease
 * variant to a clamped 0→1 function. The clip evaluator reads it per-segment to
 * reshape the linear time parameter before interpolation.
 *
 * ### Why a record rather than a switch?
 *
 * A `Record<Ease, fn>` is a data table: adding a new `Ease` variant requires
 * adding one entry here and the type expands automatically. A switch statement
 * would require a new `case` in every file that dispatches on `Ease`. With four
 * variants it's a small difference; with more the table wins clearly.
 *
 * ### Clamping contract
 *
 * Every function in `EASE` clamps its input to [0, 1] before evaluating. The
 * evaluator computes `t = elapsedSec / segmentDurationSec`; on a slow frame
 * `elapsedSec` may marginally exceed `segmentDurationSec`, producing a t
 * slightly above 1. Without clamping, `easeIn(1.001)` = 1.003... and the pose
 * overshoots the target. Clamping is a single `Math.max/min` and removes the
 * class of overshoot bugs entirely. (See also the same rationale in
 * `easeOutCubic.ts`'s "Why clamp?" section.)
 *
 * ### Reuse of easeOutCubic
 *
 * The `out` variant delegates to `easeOutCubic` (already tested and documented
 * in `src/utils/math/easeOutCubic.ts`) rather than inlining the formula. This
 * keeps there one authoritative definition of that curve; if the formula ever
 * changes (e.g. to ease-out-quart) it propagates here automatically.
 */

import type { Ease } from '../../../@types/animation/Ease';
import { easeOutCubic } from '../../../utils/math/easeOutCubic';

/** Clamp `t` to [0, 1]. Inline helper — not exported; easing is the only use. */
function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t));
}

/**
 * EASE — the canonical easing function table.
 *
 *   - `out`    : `easeOutCubic` — decelerate to the target; reuses the existing
 *                utility. Formula: `1 - (1 - t)^3`.
 *   - `in`     : cubic ease-in — accelerate from rest. Formula: `t^3`.
 *                At t=0.5: 0.125 (still only 12.5% of the way through).
 *   - `inOut`  : cubic in-out — S-curve, symmetric around t=0.5. Formula:
 *                `t < 0.5 ? 4t³ : 1 - (-2t+2)³ / 2`. Equivalent symmetric form:
 *                `t < 0.5 ? 4t³ : 1 - (2-2t)³/2`. At t=0.5 = 0.5 (inflection).
 *                Symmetry: `inOut(t) + inOut(1-t) === 1` for all t.
 *   - `linear` : identity — no reshaping. Useful when the author controls
 *                pacing via a `rate` ramp or wants predictable test values.
 */
export const EASE: Record<Ease, (t: number) => number> = {
  out: (t: number) => easeOutCubic(t), // easeOutCubic already clamps internally

  in: (t: number) => {
    const c = clamp01(t);
    return c * c * c;
  },

  inOut: (t: number) => {
    const c = clamp01(t);
    // Cubic in-out: `c < 0.5 ? 4c³ : 1 - (-2c+2)³ / 2`
    if (c < 0.5) {
      return 4 * c * c * c;
    }
    const inv = -2 * c + 2;
    return 1 - (inv * inv * inv) / 2;
  },

  linear: (t: number) => clamp01(t),
};
