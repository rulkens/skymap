/**
 * cameraDrivers — the single arbiter that turns camera precedence from
 * statement order into data.
 *
 * The engine has several movers that all want to author `state.cam` on a
 * given frame: an in-flight tween, idle auto-rotate, and a guided tour.
 * Previously the winner was whoever ran last in the per-frame body, with
 * hand-written guards suppressing the losers. Precedence was emergent
 * from control flow, so inserting a mover or changing who-beats-whom
 * meant surgery on the frame loop.
 *
 * `runCameraDrivers` collapses that into one rule: among the drivers
 * that declare themselves active this frame, the highest `priority` wins,
 * and ONLY that winner's `pose` is returned. Two properties fall out of
 * this deliberately:
 *
 *   - Single-writer arbitration. There is exactly one pose returned per
 *     frame — the chosen winner's. The design bakes this in: there is NO
 *     cooperative blending of multiple drivers into one frame. A frame is
 *     authored by one driver. Blending would reintroduce the "who
 *     contributed what, in what order" entanglement this seam exists to
 *     remove.
 *
 *   - Precedence is data. The ordering between movers is a `priority`
 *     number on each driver, not a position in a sequence of statements.
 *     Re-ranking or slotting in a new mover is a one-line declaration.
 *
 * The resolver is pure over its driver list. It captures no state, does
 * no I/O, and treats `drivers` as readonly — it never sort-mutates the
 * caller's array (a single max-scan, not a `.sort()`). It RETURNS the
 * winner's `CameraPose` — the call site applies that pose to `state.cam`.
 * The always-active `resting` floor (priority 0) ensures the resolver
 * always has a winner and never returns a nullable.
 *
 * `buildCameraDrivers` is the other half of the seam: a pure builder
 * that wraps the engine's camera movers as `CameraDriver`s and hands
 * back the list the resolver scans. Each wrapper closes over the live
 * `state` for `isActive`; `pose` uses its `cam` param directly.
 * The `resting` floor is the permanent always-active member; the
 * other two are temporary shims until the Redux store holds camera pose.
 */

import type { CameraDriver } from '../../../@types/engine/camera/CameraDriver';
import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { OrbitCamera } from '../../../@types/camera/OrbitCamera';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { RootState } from '../../../store/types';
import { updatePosition } from '../../camera/orbitCamera';
import { poseOf } from './poseOf';

export function runCameraDrivers(
  drivers: readonly CameraDriver[],
  s: RootState,
  cam: OrbitCamera,
  elapsedMs: number,
): CameraPose {
  // Single max-scan rather than filter-then-sort: sorting would either
  // mutate the caller's array (forbidden — `drivers` is readonly) or
  // allocate a copy for no reason. We only ever need the one winner, so
  // we fold the active drivers into a running best-by-priority.
  let winner: CameraDriver | null = null;
  for (const driver of drivers) {
    if (!driver.isActive(s)) continue;
    if (winner === null || driver.priority > winner.priority) {
      winner = driver;
    }
  }

  // The resting floor (priority 0, always active) makes this branch
  // unreachable in normal operation — it fires only if the caller passes
  // an empty or all-inactive driver list.
  if (winner === null) return poseOf(cam);

  return winner.pose(s, cam, elapsedMs);
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
 * Each wrapper closes over the live `state` for `isActive`; `pose` uses
 * its `cam` param so the resolver's write-back in `runFrame.ts` operates
 * on the live orbit camera. Settings toggles and subsystem state are read
 * fresh every frame through the `isActive` closures. The drivers, highest
 * priority first:
 *
 *   - `tween` (60) — an in-flight focus/framing tween. Shim: advances
 *     tweens against the `cam` param, returns the updated pose.
 *   - `autoRotate` (20) — the idle drift. Shim: nudges yaw on `cam`.
 *   - `resting` (0) — always active; returns a pose from `cam`.
 *     Permanent floor: guarantees the resolver always has a winner.
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
      pose: (_s, cam) => {
        // Shim: advance the tween against the `cam` param forwarded by
        // the resolver. `advance` returns a finished-this-frame boolean;
        // discard it. `performance.now()` supplies wall-clock time because
        // TweenManager needs absolute time, not an elapsed delta.
        state.subsystems.tweens.advance(cam, performance.now());
        return poseOf(cam);
      },
    },
    {
      id: 'autoRotate',
      priority: 20,
      isActive: () => state.settings.camera.autoRotate,
      pose: (_s, cam) => {
        cam.yaw += AUTO_ROTATE_YAW_DELTA;
        updatePosition(cam);
        return poseOf(cam);
      },
    },
    {
      id: 'resting',
      priority: 0,
      isActive: () => true,
      pose: (_s, cam) => poseOf(cam),
    },
  ];
}
