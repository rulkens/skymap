/**
 * cameraDrivers — the single arbiter that turns camera precedence from
 * statement order into data.
 *
 * The engine has several movers that all want to write `state.cam` on a
 * given frame: an in-flight tween, idle auto-rotate, and a guided tour.
 * Previously the winner was whoever ran last in the
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
 *
 * `buildCameraDrivers` is the other half of the seam: a pure builder
 * that wraps the engine's existing camera movers as `CameraDriver`s and
 * hands back the list the resolver scans. Each wrapper closes over the
 * live `state`, so a toggled setting or a freshly-started tween is
 * reflected on the very next frame without rebuilding the list. The
 * wrappers are deliberately thin — they map "is this mover active?" and
 * "let this mover write the camera" onto the subsystems that already own
 * that behaviour (`tweens`) or onto the one-line auto-rotate increment,
 * rather than reimplementing any of it. The list
 * is built once at loop start and carried on `RunFrameDeps`, not on
 * `EngineState`: it is a per-frame dependency of the frame body, not a
 * piece of engine-owned mutable state, so threading it through the deps
 * bag keeps the state contract from widening into mirror data.
 */

import type { CameraDriver } from '../../../@types/engine/camera/CameraDriver';
import type { OrbitCamera } from '../../../@types/camera/OrbitCamera';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import { updatePosition } from '../../camera/orbitCamera';

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

/**
 * Idle auto-rotate yaw increment, in radians per frame.
 *
 * A constant per-frame nudge (not time-scaled) so the spin reads as a
 * gentle, frame-rate-tied drift — the same value the per-frame body used
 * before camera authority moved behind the driver seam.
 */
const AUTO_ROTATE_YAW_DELTA = 0.000873;

/**
 * Build the engine's camera drivers — pure over `state`, returning the
 * fixed set of wrappers in no particular order (priority, not position,
 * decides who wins).
 *
 * Each wrapper closes over the live `state`, so the list is built once
 * and never needs rebuilding: settings toggles and subsystem state are
 * read fresh every frame through the closures. The drivers, highest
 * priority first:
 *
 *   - `tween` (60) — an in-flight focus/framing tween.
 *   - `autoRotate` (20) — the idle drift, lowest priority so any of the
 *     above suppresses it.
 *
 * The `tour` driver (priority 80) is intentionally absent — a separate
 * plan slots it in above the tween.
 */
export function buildCameraDrivers(state: EngineState): readonly CameraDriver[] {
  return [
    {
      id: 'tween',
      priority: 60,
      isActive: () => state.subsystems.tweens.isActive(),
      apply: (cam, nowMs) => {
        // `advance` returns a finished-this-frame boolean the engine has
        // never consumed; a block discards it so `apply` stays void.
        state.subsystems.tweens.advance(cam, nowMs);
      },
    },
    {
      id: 'autoRotate',
      priority: 20,
      isActive: () => state.settings.camera.autoRotate,
      apply: (cam) => {
        cam.yaw += AUTO_ROTATE_YAW_DELTA;
        updatePosition(cam);
      },
    },
  ];
}
