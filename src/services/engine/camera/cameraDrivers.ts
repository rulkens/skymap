/**
 * cameraDrivers — the camera-driver table and its resolver.
 *
 * The engine has several movers that each want to author the camera pose on a
 * given frame: an in-flight focus tween, idle auto-rotate, an orbit-controls
 * gesture, and a resting floor. They are resolved as a priority-ranked table
 * rather than by call order in the frame body, so inserting a mover or changing
 * who-beats-whom is a data edit, not surgery on the frame loop.
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
 * `buildCameraDrivers` produces the six-row table that reads directly from the
 * Redux store. Most drivers' `isActive` and `pose` read only `s.camera.*`; `cam`
 * is forwarded to the `orbitDrag` driver, which reads `state.cam` (the gesture
 * register) for its live yaw/pitch/distance. The `followBody` driver is the one
 * that needs the engine snapshot, so `buildCameraDrivers(state)` closes over
 * `EngineState`: follow reads the per-frame body-state snapshot (primed by
 * `runFrame` before produce), the live lens FOV, and the follow ease clock.
 *
 * Priorities: clip 95 > orbitDrag 80 > followBody 70 > tween 60 > autoRotate 20
 * > resting 0. The gap between each step is deliberate headroom so a future
 * driver can slot in without renumbering. `followBody` sits between `orbitDrag`
 * and `tween` on purpose: a held drag still wins (the user can reorient a
 * followed body), but follow replaces the tween for body targets so the two
 * never both author the camera. The clip@95 and tween@60 rows share ONE
 * evaluator: both produce their pose through `evaluateClip` (the tween via
 * `tweenToClip`), differing only in priority and which `camera.*` descriptor
 * they read.
 */

import type { CameraDriver } from '../../../@types/engine/camera/CameraDriver';
import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { OrbitCamera } from '../../../@types/camera/OrbitCamera';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { RootState } from '../../../store/types';
import type { CameraClock } from '../../../@types/engine/camera/CameraClock';
import { poseOf } from './poseOf';
import { tweenToClip } from './tweenToClip';
import { spinAutoRotate } from './spinAutoRotate';
import { tweenElapsed, autoRotateElapsed, clipElapsed, followElapsed } from './cameraClock';
import { evaluateClip } from './evaluateClip';
import { bodyLikeFraming } from './bodyLikeFraming';
import { FOCUS_TWEEN_MS } from './focusTweenDuration';
import { deriveBodyStates } from '../frame/deriveBodyStates';
import { easeOutCubic } from '../../../utils/math/easeOutCubic';
import { lerp } from '../../../utils/math/lerp';

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
 * Compute the elapsed value for whichever driver won this frame.
 *
 * `orbitDrag` and `resting` are stateless — they do not use elapsed time,
 * so 0 is the correct and only sensible value. `tween` and `autoRotate`
 * both need cumulative elapsed time from their respective clocks. `clip`
 * needs cumulative elapsed in SECONDS (not ms) — `evaluateClip` takes
 * `elapsedSec`. Dispatching on `winner.id` is a table lookup keyed on a
 * stable string — cleaner than a chain of `if (driver === tweenDriver)`
 * identity checks.
 *
 * UNIT NOTE: the returned value is passed straight to the winner's `pose`.
 * Each driver interprets it in its own unit — `tween` and `autoRotate` expect
 * ms; `clip` expects SECONDS. This is intentional: the generic `elapsedMs`
 * name on the CameraDriver type is approximate; do not 'fix' the clip arm to
 * multiply by 1000.
 */
function elapsedForWinner(
  winner: CameraDriver,
  s: RootState,
  clock: CameraClock,
  nowMs: number,
): number {
  if (winner.id === 'clip') return clipElapsed(clock, s.camera.clip, nowMs); // returns SECONDS
  if (winner.id === 'tween') return tweenElapsed(clock, s.camera.tween, nowMs); // returns ms
  if (winner.id === 'autoRotate')
    return autoRotateElapsed(clock, s.camera.autoRotate.active, s.camera.base, nowMs); // returns ms
  if (winner.id === 'followBody')
    // Keys on the focus ROW reference so a new / re-selected body restarts the
    // approach ease; a drag mid-follow leaves it untouched. returns ms.
    return followElapsed(clock, s.selectionRows.focus, nowMs);
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
 * Build the engine's camera-driver table — six rows, store-reading, returned
 * in priority order for readability (the resolver uses a max-scan, so order
 * does not affect correctness).
 *
 * The `state` parameter is closed over for the `followBody` driver alone (see
 * below); the other five read only `RootState` and mutate neither `state.cam`
 * nor `EngineState`.
 *
 * Drivers, highest priority first:
 *
 *   - `clip` (95) — an in-flight animation clip. Active while `s.camera.clip`
 *     is non-null. Owns the camera above orbitDrag so a playing clip cannot
 *     be interrupted by a drag gesture. `commitsOnEdge: true` bakes the clip's
 *     final pose into `base` on deactivation — the camera holds the last frame
 *     of the clip rather than snapping back to the pre-clip base. Elapsed is
 *     in SECONDS (evaluateClip's unit).
 *
 *   - `orbitDrag` (80) — the live gesture register (`state.cam`). Active while
 *     `s.camera.dragging` is true. Returns `poseOf(cam)` so the controls keep
 *     directly manipulating the register without re-composing through the store.
 *
 *   - `followBody` (70) — a focus on a moving scene body. Active while
 *     `s.selectionRows.focus` is a body present in this frame's body snapshot.
 *     Its target term is ALWAYS the live body position (so it tracks the body as
 *     the sim clock moves it), while yaw/pitch stay world-frame (translate-
 *     follow); on activation it eases the distance from the captured on-screen
 *     pose into the `bodyLikeFraming` framing distance over `FOCUS_TWEEN_MS`.
 *     `commitsOnEdge: true` bakes the last follow pose into `base` on
 *     deactivation, so lower drivers resume from where the camera is (no snap-
 *     back). It replaces the tween for body targets — the tween compiles fixed
 *     vec3 endpoints and cannot track a moving destination, so the focus saga
 *     routes body focus here instead of dispatching a tween.
 *
 *   - `tween` (60) — an in-flight focus tween. Active while `s.camera.tween`
 *     is non-null. Pure: reads `s.camera.tween` + `elapsedMs` from the clock,
 *     converts descriptor via `tweenToClip`, calls `evaluateClip(data, elapsed/1000)`.
 *
 *   - `autoRotate` (20) — the idle drift. Active while
 *     `s.camera.autoRotate.active` is true. Pure: returns
 *     `spinAutoRotate(s.camera.base, rate, elapsedMs)` — base is frozen while
 *     active, giving a rate-accurate spin regardless of frame rate.
 *
 *   - `resting` (0) — always active; returns `s.camera.base` as-is. The
 *     permanent floor that guarantees the resolver always has a winner.
 */
export function buildCameraDrivers(state: EngineState): readonly CameraDriver[] {
  return [
    {
      id: 'clip',
      priority: 95,
      // When the clip ends, bake its final pose into `base` so the camera
      // holds the saturated pose (not snap back to whatever base was before
      // the clip started). Task 10's frame loop reads this flag; it does not
      // hardcode 'clip' as a string.
      commitsOnEdge: true,
      isActive: (s) => s.camera.clip !== null,
      // elapsed here is SECONDS from clipElapsed (not ms) — evaluateClip
      // takes elapsedSec. See the UNIT NOTE in elapsedForWinner.
      pose: (s, _cam, elapsed) => evaluateClip(s.camera.clip!.data, elapsed),
    },
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
      id: 'followBody',
      priority: 70,
      // Leaving focus (null / a non-body row) deactivates the row; the last
      // follow pose is baked into `base` so lower drivers resume from where the
      // camera actually is rather than snapping back to the pre-focus base.
      commitsOnEdge: true,
      // Active when the focus resolves to a scene body that is present in THIS
      // frame's body snapshot. The focus row is RootState; the snapshot is the
      // memoized `deriveBodyStates` map at the instant `runFrame` derived this
      // frame's bodies (`lastRenderedSimDays.current`, written before produce) —
      // a same-instant call returns the cached Map for free, so this reads the
      // frame stash without a second Kepler solve. A star / structure / galaxy
      // focus is not a body, so this stays false and the tween owns those.
      isActive: (s) => {
        const focus = s.selectionRows.focus;
        if (focus === null || focus.type !== 'body') return false;
        return deriveBodyStates(state.cameraRuntime.lastRenderedSimDays.current).has(focus.id);
      },
      // The follow pose. `elapsed` is ms since the approach started (from
      // `followElapsed`, keyed on the focus row reference). The target term is
      // always the LIVE body position, so the camera tracks the body the sim
      // clock is moving. yaw/pitch translate-follow (they ease from the captured
      // on-screen pose toward the committed base, so a post-follow drag is
      // honoured while an un-dragged follow keeps its heading). Distance eases
      // from the captured pose into the physical-radius framing distance.
      pose: (s, _cam, elapsed) => {
        const focus = s.selectionRows.focus;
        const clock = state.cameraRuntime.clock;
        // Defensive: pose only runs for the winner, so isActive already proved a
        // body focus present in the snapshot this same frame — but a null-guard
        // keeps the arm total, falling back to the resting pose.
        if (focus === null || focus.type !== 'body') return s.camera.base;
        const live = deriveBodyStates(state.cameraRuntime.lastRenderedSimDays.current).get(
          focus.id,
        );
        if (live === undefined) return s.camera.base;

        // Capture the `from` pose ONCE per activation. `followElapsed` nulls it
        // on the edge; the first produce after fills it from the LIVE rendered
        // pose (the previous frame's, not yet overwritten this frame) so the ease
        // starts where the camera visibly is — switching focus A→B eases from
        // framing-A, never jumping back to the committed base first.
        if (clock.followFrom === null) {
          const cur = state.cameraRuntime.lastPose.current;
          clock.followFrom = {
            target: [cur.target[0], cur.target[1], cur.target[2]],
            yaw: cur.yaw,
            pitch: cur.pitch,
            distance: cur.distance,
          };
        }
        const from = clock.followFrom;
        const base = s.camera.base;
        // Reuse the shared body framing math — only its distance is read here;
        // the target term below is the live body position, not the framing's.
        const framing = bodyLikeFraming(
          live.positionMpc,
          focus.radiusKm,
          state.cameraRuntime.projection.fovYRad,
        );
        const t = easeOutCubic(elapsed / FOCUS_TWEEN_MS);
        return {
          // Alias the live snapshot position (a fresh, immutable per-frame array
          // downstream reads read-only) — the target is the body, always.
          target: live.positionMpc,
          yaw: lerp(from.yaw, base.yaw, t),
          pitch: lerp(from.pitch, base.pitch, t),
          distance: lerp(from.distance, framing.distance, t),
        };
      },
    },
    {
      id: 'tween',
      priority: 60,
      // Bake the tween's final pose into `base` on deactivation so that a
      // tween-to-focus lands cleanly rather than snapping to the pre-tween base.
      commitsOnEdge: true,
      isActive: (s) => s.camera.tween !== null,
      // `tweenToClip` converts the descriptor to a ClipData (memoised by
      // reference) so `evaluateClip`'s compile cache reuses tracks across frames.
      // `elapsedMs / 1000` converts to the seconds unit `evaluateClip` expects.
      pose: (s, _cam, elapsedMs) => evaluateClip(tweenToClip(s.camera.tween!), elapsedMs / 1000),
    },
    {
      id: 'autoRotate',
      priority: 20,
      // Bake the spin's accumulated yaw into `base` when auto-rotate stops,
      // so resume picks up from the final heading rather than jumping back.
      commitsOnEdge: true,
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
