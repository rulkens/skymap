/**
 * CameraDriver — the seam that turns camera precedence into DATA.
 *
 * The engine has several things that all want to move the camera on a
 * given frame: an in-flight tween, the idle auto-rotate, and a guided
 * tour. Historically the winner was decided by *call order* inside the
 * per-frame body — tween advanced first, then a hand-written guard
 * suppressed auto-rotate when anything else was active. Precedence was
 * an emergent property of how the statements happened to be sequenced,
 * which meant inserting a new mover (or changing who beats whom) was a
 * surgical edit to control flow rather than a one-line declaration.
 *
 * A CameraDriver makes each mover a uniform, self-describing unit so a
 * single resolver can pick the winner by comparing `priority` instead
 * of relying on statement order. The set of drivers is a registry; the
 * ordering between them is a number. Adding a tour, or re-ranking the
 * existing movers, becomes data — not a rewrite of the frame loop.
 *
 * The five members, and why each exists:
 *
 *   - `id` — a stable string identity ('clip' | 'orbitDrag' | 'tween' |
 *     'autoRotate' | 'resting'). Purely for debugging and logging: it lets
 *     a trace say "frame written by 'tween'" without the resolver needing
 *     to know any concrete driver's type.
 *
 *   - `priority` — the sole thing the resolver orders by. The current
 *     ranking is clip 95 > orbitDrag 80 > tween 60 > autoRotate 20 >
 *     followBody 10 > resting 0; the gaps are deliberate headroom so a future driver can
 *     slot between two existing ones without renumbering. The 95 slot is
 *     occupied by the clip driver. `followBody` (10) sits BELOW autoRotate on
 *     purpose: a body focus pins the pivot (via `pivotsOnFocusedBody`), but
 *     autoRotate / a drag can still win the ORBIT terms and spin around the
 *     body — followBody only authors the initial approach ease + idle hold.
 *
 *   - `isActive(s)` — answers two questions with one predicate. Per-driver
 *     it means "do I want to author the camera pose this frame?", which
 *     is how the resolver knows whether to even consider me. Collectively
 *     (any driver active) it is also the render-on-demand signal: if no
 *     animated driver is active and nothing else is animating, the frame
 *     loop can sleep. The `resting` driver is always active (priority 0)
 *     so the resolver always has a winner. Takes the store `RootState`
 *     so drivers can read intent without coupling to EngineState.
 *
 *   - `pose(s, elapsedMs)` — returns the `FramedCameraPose` the resolver
 *     should apply this frame, in the arm the driver AUTHORS: the world-arm
 *     drivers wrap with `absoluteArm` and gate `isActive` on the absolute arm;
 *     `resting` is arm-agnostic and returns `base` untouched, and `orbitDrag`
 *     returns the live gesture register in whichever arm `drainInput` folded.
 *     Only the highest-priority active driver's `pose` is called —
 *     single-writer, no blending. NOTE: the `elapsedMs` name is generic — the
 *     clip driver interprets it as SECONDS (not ms), because `evaluateClip`
 *     takes an `elapsedSec` parameter. Each driver owns its own elapsed unit.
 *
 *   - `commitsOnEdge` — optional flag. When true, the frame loop bakes this
 *     driver's final pose into `camera.base` the frame it deactivates, so
 *     the camera holds the saturated pose rather than snapping back to the
 *     previous base. The frame loop reads this flag instead of hardcoding
 *     driver-id literals — adding a new committing driver is a one-line
 *     declaration here.
 */

import type { FramedCameraPose } from '../../camera/FramedCameraPose';
import type { RootState } from '../../../store/types';

export type CameraDriver = {
  readonly id: string;
  readonly priority: number;
  // Drivers whose final pose must bake into `camera.base` when they DEACTIVATE
  // set this (so the frame loop freezes the saturated pose instead of snapping
  // back). The frame loop (Task 10) reads this flag instead of hardcoding
  // driver-id literals.
  readonly commitsOnEdge?: boolean;
  // Drivers that author an ORBIT pose (yaw / pitch / distance around a target)
  // set this so the frame loop re-centres their `target` on the focused scene
  // body while one is focused (the pivot-pin, `applyFocusedBodyPivot`). The body
  // owns the pivot; the driver owns the orbit terms. clip / tween keyframe a full
  // path (target included) and leave this unset so their target is honoured.
  readonly pivotsOnFocusedBody?: boolean;
  isActive(s: RootState): boolean;
  pose(s: RootState, elapsedMs: number): FramedCameraPose;
};
