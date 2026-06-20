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
 * The four members, and why each exists:
 *
 *   - `id` — a stable string identity ('tween' | 'autoRotate' | 'resting',
 *     with 'tour' joining later). Purely for debugging and logging: it
 *     lets a trace say "frame written by 'tween'" without the resolver
 *     needing to know any concrete driver's type.
 *
 *   - `priority` — the sole thing the resolver orders by. The current
 *     ranking is tour 80 > tween 60 > autoRotate 20 > resting 0; the
 *     gap around 80 is deliberate headroom so a future driver can slot
 *     between two existing ones without renumbering.
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
 *   - `pose(s, cam, elapsedMs)` — returns the `CameraPose` the resolver
 *     should apply this frame. Only the highest-priority active driver's
 *     `pose` is called — single-writer, no blending. The `cam` reference
 *     is forwarded so shim drivers (that still advance engine state) can
 *     read the live orbit params; real store-reading drivers read `s`
 *     instead.
 */

import type { OrbitCamera } from '../../camera/OrbitCamera';
import type { CameraPose } from '../../camera/CameraPose';
import type { RootState } from '../../../store/types';

export type CameraDriver = {
  readonly id: string;
  readonly priority: number;
  isActive(s: RootState): boolean;
  pose(s: RootState, cam: OrbitCamera, elapsedMs: number): CameraPose;
};
