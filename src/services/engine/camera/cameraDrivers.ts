/**
 * cameraDrivers — the camera-driver table and its resolver.
 *
 * The engine has several movers that each want to author the camera pose on a
 * given frame: an in-flight focus tween, idle auto-rotate, an orbit-controls
 * gesture, and a resting floor. Previously the winner was decided by call order
 * in the per-frame body, with hand-written guards suppressing the losers.
 * Precedence was emergent from control flow, so inserting a mover or changing
 * who-beats-whom meant surgery on the frame loop.
 *
 * `runCameraDrivers` collapses that into one rule: among the drivers that declare
 * themselves active this frame, the highest `priority` wins, and ONLY that
 * winner's `pose` is returned. Two properties fall out of this:
 *
 *   - Single-writer arbitration. There is exactly one pose returned per frame —
 *     the chosen winner's. There is NO cooperative blending of multiple drivers
 *     into one frame. A frame is authored by one driver. Blending would
 *     reintroduce the 'who contributed what, in what order' entanglement this
 *     seam exists to remove.
 *
 *   - Precedence is data. The ordering between movers is a `priority` number on
 *     each driver, not a position in a sequence of statements. Re-ranking or
 *     slotting in a new mover is a one-line declaration.
 *
 * `pickWinner` is exported so `activeDriverId` can call it and get the SAME
 * winner, guaranteeing that the driver's `pose` and the commit-on-edge guard
 * never disagree (invariant 1 of the frame-ordering contract).
 *
 * `buildCameraDrivers` produces the four-row table that reads directly from the
 * Redux store. Each driver's `isActive` and `pose` read `s.camera.*`, so the
 * resolver needs only the store `RootState` to work; `cam` is still forwarded
 * to the `orbitDrag` driver, which reads `state.cam` (the gesture register) for
 * its live yaw/pitch/distance. The `_state: EngineState` parameter is unused
 * but kept for stability at the `startLoop` call site.
 *
 * Priorities: orbitDrag 80 > tween 60 > autoRotate 20 > resting 0. The gap
 * between each step is deliberate headroom so a future driver (e.g. a tour at
 * 95) can slot in without renumbering.
 */

import type { CameraDriver } from '../../../@types/engine/camera/CameraDriver';
import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { OrbitCamera } from '../../../@types/camera/OrbitCamera';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { RootState } from '../../../store/types';
import type { CameraClock } from '../../../@types/engine/camera/CameraClock';
import { poseOf } from './poseOf';
import { evaluateTween } from './evaluateTween';
import { spinAutoRotate } from './spinAutoRotate';
import { tweenElapsed, autoRotateElapsed } from './cameraClock';

/**
 * Pick the highest-priority active driver. A pure max-scan over `drivers`:
 * never mutates the array, never allocates an intermediate sort copy. The
 * always-active `resting` floor (priority 0) ensures the result is never null
 * in normal operation; the defensive fallback (`drivers[0]!`) only fires for an
 * empty list.
 *
 * Exported so `activeDriverId` can call the exact same function and guarantee
 * that 'who produced the pose' and 'what was the winning id' are decided by one
 * code path, not two independent scans that could disagree.
 */
export function pickWinner(drivers: readonly CameraDriver[], s: RootState): CameraDriver {
  let winner: CameraDriver | null = null;
  for (const d of drivers) {
    if (!d.isActive(s)) continue;
    if (winner === null || d.priority > winner.priority) winner = d;
  }
  // Defensive fallback: the resting floor makes this unreachable in normal
  // operation; it fires only for an empty list.
  return winner ?? drivers[0]!;
}

/**
 * Compute the elapsed ms for whichever driver won this frame.
 *
 * `orbitDrag` and `resting` are stateless — they do not use elapsed time,
 * so 0 is the correct and only sensible value. `tween` and `autoRotate`
 * both need cumulative elapsed time from their respective clocks. Dispatching
 * on `winner.id` is a table lookup keyed on a stable string — cleaner than a
 * chain of `if (driver === tweenDriver)` identity checks.
 */
function elapsedForWinner(
  winner: CameraDriver,
  s: RootState,
  clock: CameraClock,
  nowMs: number,
): number {
  if (winner.id === 'tween') return tweenElapsed(clock, s.camera.tween, nowMs);
  if (winner.id === 'autoRotate') return autoRotateElapsed(clock, s.camera.autoRotate.active, nowMs);
  // orbitDrag and resting are stateless; elapsed is irrelevant to their pose.
  return 0;
}

/**
 * Resolve the per-frame camera pose.
 *
 * Calls `pickWinner` once, computes the winner's elapsed time via
 * `elapsedForWinner`, and delegates to the winner's `pose`. The caller
 * receives a single `CameraPose` — the frame is authored by one driver.
 *
 * The `clock` parameter is mutated as a side effect: `tweenElapsed` and
 * `autoRotateElapsed` detect descriptor-identity changes and reset start times.
 * The clock must therefore be called exactly once per frame — this function
 * enforces that contract by being the sole caller of the elapsed helpers in the
 * hot path.
 */
export function runCameraDrivers(
  drivers: readonly CameraDriver[],
  s: RootState,
  cam: OrbitCamera,
  clock: CameraClock,
  nowMs: number,
): CameraPose {
  const winner = pickWinner(drivers, s);
  const elapsed = elapsedForWinner(winner, s, clock, nowMs);
  return winner.pose(s, cam, elapsed);
}

/**
 * Build the engine's camera-driver table — four rows, store-reading, returned
 * in priority order for readability (the resolver uses a max-scan, so order
 * does not affect correctness).
 *
 * All four drivers read directly from the Redux store `RootState`; none of them
 * mutate `state.cam` or `EngineState`. The `_state` parameter is kept for
 * stability at the `startLoop.ts` call site (`buildCameraDrivers(state)`) — it
 * is unused here because the drivers close over nothing from `EngineState`.
 *
 * Drivers, highest priority first:
 *
 *   - `orbitDrag` (80) — the live gesture register (`state.cam`). Active while
 *     `s.camera.dragging` is true. Returns `poseOf(cam)` so the controls keep
 *     directly manipulating the register without re-composing through the store.
 *
 *   - `tween` (60) — an in-flight focus tween. Active while `s.camera.tween`
 *     is non-null. Pure: reads `s.camera.tween` + `elapsedMs` from the clock,
 *     returns `evaluateTween(descriptor, elapsed)`.
 *
 *   - `autoRotate` (20) — the idle drift. Active while
 *     `s.camera.autoRotate.active` is true. Pure: returns
 *     `spinAutoRotate(s.camera.base, rate, elapsedMs)` — base is frozen while
 *     active, giving a rate-accurate spin regardless of frame rate.
 *
 *   - `resting` (0) — always active; returns `s.camera.base` as-is. The
 *     permanent floor that guarantees the resolver always has a winner.
 */
export function buildCameraDrivers(_state: EngineState): readonly CameraDriver[] {
  return [
    {
      id: 'orbitDrag',
      priority: 80,
      isActive: (s) => s.camera.dragging,
      // The live drag register is the source of truth while the gesture is
      // held — poseOf reads yaw/pitch/distance/target off the OrbitCamera
      // that orbitControls mutates in real time.
      pose: (_s, cam) => poseOf(cam),
    },
    {
      id: 'tween',
      priority: 60,
      isActive: (s) => s.camera.tween !== null,
      pose: (s, _cam, elapsedMs) => evaluateTween(s.camera.tween!, elapsedMs),
    },
    {
      id: 'autoRotate',
      priority: 20,
      isActive: (s) => s.camera.autoRotate.active,
      // Spins from the FROZEN base: base does not update while autoRotate wins
      // (commit-on-edge only fires on driver deactivation), so the yaw advances
      // at the correct cumulative rate rather than a per-frame delta off a
      // moving base.
      pose: (s, _cam, elapsedMs) =>
        spinAutoRotate(s.camera.base, s.camera.autoRotate.rate, elapsedMs),
    },
    {
      id: 'resting',
      priority: 0,
      isActive: () => true,
      // At rest, the committed base IS the pose. No clock, no elapsed — pure
      // identity read from the store.
      pose: (s) => s.camera.base,
    },
  ];
}
