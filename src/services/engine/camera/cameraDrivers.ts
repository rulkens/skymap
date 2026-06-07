/**
 * cameraDrivers — the single arbiter that turns camera precedence from
 * statement order into data.
 *
 * The engine has several movers that all want to write `state.cam` on a
 * given frame: raw input, an in-flight tween, idle auto-rotate, and a
 * guided tour. Previously the winner was whoever ran last in the
 * per-frame body, with hand-written guards suppressing the losers.
 * Precedence was emergent from control flow, so inserting a mover or
 * changing who-beats-whom meant surgery on the frame loop.
 *
 * `runCameraDrivers` collapses that into one rule: among the drivers
 * that declare themselves active this frame, the highest `priority`
 * wins, and ONLY that winner's `apply` runs. Two properties fall out of
 * this deliberately:
 *
 *   - Single-writer arbitration. There is exactly one camera-write site
 *     per frame — the chosen winner's `apply`. The design bakes this in:
 *     there is NO cooperative blending of multiple drivers into one
 *     frame. A frame is authored by one driver or by none. Blending
 *     would reintroduce the "who contributed what, in what order"
 *     entanglement this seam exists to remove.
 *
 *   - Precedence is data. The ordering between movers is a `priority`
 *     number on each driver, not a position in a sequence of statements.
 *     Re-ranking or slotting in a new mover is a one-line declaration.
 *
 * The resolver is pure over its driver list. It captures no state, does
 * no I/O, and treats `drivers` as readonly — it never sort-mutates the
 * caller's array (a single max-scan, not a `.sort()`). It also never
 * reads or mutates `cam`; it only forwards the reference (and `nowMs`)
 * to the winner's `apply`, so the camera remains entirely the winner's
 * concern. That purity is what makes the heart of camera authority
 * testable with a throwaway `cam` stub and a handful of fake drivers.
 */

import type { CameraDriver } from '../../../@types/engine/camera/CameraDriver';
import type { OrbitCamera } from '../../../@types/camera/OrbitCamera';

export function runCameraDrivers(
  drivers: readonly CameraDriver[],
  cam: OrbitCamera,
  nowMs: number,
): void {
  // Single max-scan rather than filter-then-sort: sorting would either
  // mutate the caller's array (forbidden — `drivers` is readonly) or
  // allocate a copy for no reason. We only ever need the one winner, so
  // we fold the active drivers into a running best-by-priority.
  let winner: CameraDriver | null = null;
  for (const driver of drivers) {
    if (!driver.isActive(nowMs)) continue;
    if (winner === null || driver.priority > winner.priority) {
      winner = driver;
    }
  }

  // No active driver means no camera write this frame — the resolver
  // calls no `apply` at all rather than falling back to some default.
  if (winner !== null) {
    winner.apply(cam, nowMs);
  }
}
