/**
 * CameraDriver — the seam that turns camera precedence into DATA.
 *
 * The engine has several things that all want to move the camera on a
 * given frame: raw input (SpaceMouse / drag), an in-flight tween, the
 * idle auto-rotate, and (added later) a guided tour. Historically the
 * winner was decided by *call order* inside the per-frame body — tween
 * advanced first, then input overwrote it, then a hand-written guard
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
 *   - `id` — a stable string identity ('input' | 'tween' | 'autoRotate',
 *     with 'tour' joining later). Purely for debugging and logging: it
 *     lets a trace say "frame written by 'tween'" without the resolver
 *     needing to know any concrete driver's type.
 *
 *   - `priority` — the sole thing the resolver orders by. The current
 *     ranking is input 100 > tour 80 > tween 60 > autoRotate 20; the
 *     gap below 100 and around 80 is deliberate headroom so a future
 *     driver can slot between two existing ones without renumbering.
 *
 *   - `isActive(nowMs)` — answers two questions with one predicate.
 *     Per-driver it means "do I want to write state.cam this frame?",
 *     which is how the resolver knows whether to even consider me.
 *     Collectively (any driver active) it is also the render-on-demand
 *     signal: if no driver is active and nothing else is animating, the
 *     frame loop can sleep. Folding both into one predicate keeps the
 *     "is the camera moving?" truth in a single place per driver.
 *
 *   - `apply(cam, nowMs)` — the single mutation a driver performs. Only
 *     the resolver's chosen winner gets its `apply` called, so there is
 *     exactly one camera-write site per frame. A driver mutates `cam`
 *     in place (the camera is the engine's live mutable shell); it
 *     returns nothing because the camera *is* the output.
 */

import type { OrbitCamera } from '../../../camera/OrbitCamera';

export type CameraDriver = {
  readonly id: string;
  readonly priority: number;
  isActive(nowMs: number): boolean;
  apply(cam: OrbitCamera, nowMs: number): void;
};
