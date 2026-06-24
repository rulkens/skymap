/**
 * Ease — the four easing modes available to a clip's CameraAction segments.
 *
 * Easing reshapes a linear time parameter `t ∈ [0,1]` into a curve that feels
 * natural for camera motion. The four variants cover the practical range:
 *
 *   - `'out'`    — decelerate toward the end. The camera starts fast and
 *                  settles gently on the target. Good for "arrive at a
 *                  destination" moves. Uses `easeOutCubic` (1-(1-t)³).
 *
 *   - `'in'`     — accelerate from the start. The camera starts slowly and
 *                  picks up speed. Good for departing shots. Uses t³.
 *
 *   - `'inOut'`  — accelerate then decelerate (S-curve). The camera starts
 *                  and ends gently; the middle is the fastest point. The most
 *                  natural for a complete arc from A to B. Uses cubic in-out:
 *                  `t < 0.5 ? 4t³ : 1 - (-2t+2)³/2`.
 *
 *   - `'linear'` — no reshaping; useful when the author wants to control
 *                  pacing manually (e.g. via a `rate` channel that already
 *                  ramps velocity), or for mathematical test assertions where
 *                  a known-linear relationship is verified.
 *
 * The runtime table keyed by this type lives in
 * `src/services/engine/animation/ease.ts` (`EASE`).
 */

export type Ease = 'in' | 'out' | 'inOut' | 'linear';
