/**
 * Space — the interpolation space for a channel's base-track segments.
 *
 * Different camera parameters live on fundamentally different numeric manifolds,
 * and interpolating them in the wrong space creates visually wrong motion:
 *
 *   - `'log'` — logarithmic (multiplicative) space. Used for `distance`.
 *     Zooming from 1 Mpc to 100 Mpc should feel perceptually uniform: the
 *     first half of the animation covers 1→10 Mpc, the second half 10→100 Mpc.
 *     Linear interpolation spends 99% of the animation between 1 and 100, then
 *     snaps to 100 — the viewer sees almost no motion, then a sudden jump.
 *     Log interpolation: `exp(lerp(ln(from), ln(to), t))`, a geometric mean at
 *     the midpoint. Alternative rejected: per-segment unit specification; the
 *     channel's natural space is stable (distance is always log), so one
 *     canonical lookup avoids every author having to remember to set `space`.
 *
 *   - `'add'` — additive (angle) space. Used for `yaw` and `pitch`.
 *     Angles are relative offsets from the orbit origin; lerp gives the right
 *     straight-line angular path. (Shortest-arc correction for yaw is handled
 *     by `lerpAngleShortest` at the call site — that is a different concern from
 *     the interpolation arithmetic here.)
 *
 *   - `'lin'` — plain linear space. Used for `target` (world-space Mpc
 *     coordinates). The camera target moves in Cartesian space; each component
 *     interpolates independently and linearly. Log would be wrong here (world
 *     coordinates are signed; `ln` of a negative or zero value is undefined).
 *
 * The canonical mapping from `Channel` to `Space` lives in exactly one place:
 * `CHANNEL_SPACE` in `src/services/engine/animation/channelSpace.ts`.
 */

export type Space = 'log' | 'add' | 'lin';
