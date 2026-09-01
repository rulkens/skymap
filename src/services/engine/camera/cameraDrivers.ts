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
 * Priorities: clip 95 > orbitDrag 80 > tween 60 > autoRotate 20 > followBody 10
 * > resting 0. The gap between each step is deliberate headroom so a future
 * driver can slot in without renumbering.
 *
 * Body focus is UN-BRAIDED into two concerns: the focused body owns the PIVOT
 * (the pose target), and whichever driver wins owns the ORBIT terms (yaw / pitch
 * / distance). The pivot is applied uniformly by the frame-loop pivot-pin
 * (`applyFocusedBodyPivot`) to every driver that declares `pivotsOnFocusedBody`
 * — so a drag orbits around the moving body, and the autoRotate button spins
 * around it, without the follow driver having to win the whole pose. `followBody`
 * therefore sits LOW (10, below autoRotate): its only remaining job is the
 * initial approach ease + the idle steady hold, which it authors when nothing
 * higher is active. A held drag or an active spin takes the orbit terms; the pin
 * keeps the body centred throughout. The clip@95 and tween@60 rows share ONE
 * evaluator: both produce their pose through `evaluateClip` (the tween via
 * `tweenToClip`), differing only in priority and which `camera.*` descriptor
 * they read; neither pins (they keyframe a full path including the target).
 */

import type { CameraDriver } from '../../../@types/engine/camera/CameraDriver';
import type { FramedCameraPose } from '../../../@types/camera/FramedCameraPose';
import type { OrbitCamera } from '../../../@types/camera/OrbitCamera';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { RootState } from '../../../store/types';
import type { CameraClock } from '../../../@types/engine/camera/CameraClock';
import { poseOf } from './poseOf';
import { absoluteArm } from '../../../utils/camera/absoluteArm';
import { liveWorldPose } from '../helpers/liveWorldPose';
import { tweenToClip } from './tweenToClip';
import { spinAutoRotate } from './spinAutoRotate';
import { tweenElapsed, autoRotateElapsed, clipElapsed, followElapsed } from './cameraClock';
import { evaluateClip } from './evaluateClip';
import { reencodePose } from '../../../utils/camera/reencodePose';
import { bodyFocusDistance } from './bodyFocusDistance';
import { ORIENTATION_FRAMES } from '../../../data/orientation/orientationFrames';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { FOCUS_TWEEN_MS } from './focusTweenDuration';
import { liveBodyPosition } from './liveBodyPosition';
import { bodyMovesThisFrame } from '../../../utils/scene/bodyMovesThisFrame';
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
): FramedCameraPose {
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
 *     `pivotsOnFocusedBody`: while a body is focused the pivot-pin overwrites the
 *     dragged target with the live body, so a drag orbits around the moving body
 *     (no drift) rather than a frozen point.
 *
 *   - `followBody` (10) — a focus on a moving scene body. Active while
 *     `s.selectionRows.focus` is a body the sim clock propagates (the shared
 *     `bodyMovesThisFrame` predicate). Sits BELOW autoRotate
 *     so it only wins when the scene is otherwise idle: its remaining job is the
 *     initial approach ease + the steady hold. On activation it eases the distance
 *     from the captured on-screen pose into the `bodyFocusDistance` framing
 *     distance over `FOCUS_TWEEN_MS`. Once a drag has committed a zoom into `base`
 *     (or a wheel edited `clock.followDistanceTarget` directly), follow eases
 *     toward that user distance instead (the two distance sources are un-braided
 *     via `clock.followDistanceTarget` — see CameraClock), so zoom-while-following
 *     is preserved rather than the framing distance being re-asserted each frame.
 *     `commitsOnEdge: true` bakes the last follow pose into `base` on
 *     deactivation, so lower drivers resume from where the camera is (no snap-
 *     back). The moving-target problem that once forced follow to own the whole
 *     pose is now solved by the shared pivot-pin, so follow no longer needs to
 *     outrank autoRotate / the drag.
 *
 *   - `tween` (60) — an in-flight focus tween. Active while `s.camera.tween`
 *     is non-null. Pure: reads `s.camera.tween` + `elapsedMs` from the clock,
 *     converts descriptor via `tweenToClip`, calls `evaluateClip(data, elapsed/1000)`
 *     against `tween.frame` (the pinned start frame), then re-encodes forward
 *     into the current `settings.orientation` — same pinning contract as `clip`.
 *
 *   - `autoRotate` (20) — the idle drift. Active while
 *     `s.camera.autoRotate.active` is true. Pure: returns
 *     `spinAutoRotate(base.pose, rate, elapsedMs)` — base is frozen while
 *     active, giving a rate-accurate spin regardless of frame rate.
 *     `pivotsOnFocusedBody`: with a body focused the spin orbits around the live
 *     body (the pivot-pin re-centres it), which is why it outranks followBody.
 *
 *   - `resting` (0) — always active; returns `s.camera.base` as-is. The
 *     permanent floor that guarantees the resolver always has a winner. Also
 *     pivots on a focused body (belt-and-braces; followBody normally wins the
 *     idle-follow case).
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
      // takes elapsedSec. See the UNIT NOTE in elapsedForWinner. `clip.frame`
      // (pinned at dispatch time, never the live setting) is the STEADY basis
      // a flyPath's world tangents encode through — a fixed reference is what
      // makes `evaluateClip`'s compile cache stable across an in-flight
      // orientation switch (see evaluateClip's Cached type). The evaluated pose
      // is then re-encoded forward into the CURRENT frame — reencodePose returns
      // it by reference when the two bases match, the overwhelmingly common case.
      pose: (s, _cam, elapsed) => {
        const clip = s.camera.clip!;
        const evaluated = evaluateClip(clip.data, elapsed, ORIENTATION_FRAMES[clip.frame]);
        return absoluteArm(
          reencodePose(
            evaluated,
            ORIENTATION_FRAMES[clip.frame],
            ORIENTATION_FRAMES[s.settings.orientation],
          ),
        );
      },
    },
    {
      id: 'orbitDrag',
      priority: 80,
      // Orbit driver: while a body is focused the frame loop pins the pose target
      // to the live body so a drag orbits AROUND the moving body instead of a
      // frozen point (the body would otherwise drift out from under the cursor
      // mid-drag). Drag owns yaw/pitch/distance; the body owns the pivot.
      pivotsOnFocusedBody: true,
      // World-arm producer: the drag register is Mpc orbit params, so the row
      // only competes while the state is in the absolute arm (spec §7).
      isActive: (s) => s.camera.dragging && s.camera.base.frame === 'absolute',
      // The live drag register is the source of truth while the gesture is
      // held — poseOf reads yaw/pitch/distance/target off the OrbitCamera
      // that orbitControls mutates in real time. The target it reads is only
      // used when NO body is focused; otherwise the pivot-pin overwrites it.
      pose: (_s, cam) => absoluteArm(poseOf(cam)),
    },
    {
      id: 'followBody',
      priority: 10,
      // Leaving focus (null / a non-body row) deactivates the row; the last
      // follow pose is baked into `base` so lower drivers resume from where the
      // camera actually is rather than snapping back to the pre-focus base.
      commitsOnEdge: true,
      // followBody is an orbit driver too: the pivot-pin re-centres its steady
      // hold on the live body (its own `pose` already targets the body, so this
      // is idempotent — but it keeps the pin's rule uniform across every orbit
      // driver rather than special-casing followBody out of it).
      pivotsOnFocusedBody: true,
      // Active when the focus resolves to a scene body the sim clock MOVES
      // (`bodyMovesThisFrame` — an `ORBITAL_ELEMENTS` row). Following is a
      // response to motion, so a static focus (a famous star, the Sun) does not
      // activate it even though the body snapshot carries its position; a star /
      // structure / galaxy focus is not a body at all. Priority 10 (below
      // autoRotate 20) means followBody only wins when idle: autoRotate or a
      // drag takes the orbit terms while the pivot-pin keeps the body centred,
      // so the autoRotate button spins AROUND a focused body instead of being
      // blocked by follow.
      // Also gated on the absolute arm (spec §7): the approach ease and the idle
      // hold have no meaning once the state co-rotates with the body.
      isActive: (s) =>
        s.camera.base.frame === 'absolute' && bodyMovesThisFrame(s.selectionRows.focus),
      // The follow pose. `elapsed` is ms since the approach started (from
      // `followElapsed`, keyed on the focus row reference). The target term is
      // always the LIVE body position, so the camera tracks the body the sim
      // clock is moving. yaw/pitch translate-follow (they ease from the captured
      // on-screen pose toward the committed base, so a post-follow drag is
      // honoured while an un-dragged follow keeps its heading).
      //
      // Distance has TWO sources, un-braided via `clock.followDistanceTarget`
      // (see CameraClock): an INITIAL APPROACH eases into the framing distance;
      // once a drag has committed a zoom into `base`, follow eases toward THAT
      // committed `base.distance` instead, so the user can zoom while following
      // rather than having the framing distance re-asserted every frame.
      pose: (s, _cam, elapsed) => {
        const focus = s.selectionRows.focus;
        const clock = state.cameraRuntime.clock;
        // Defensive: pose only runs for the winner, so isActive already proved a
        // moving body focus this same frame, and a moving body is in the snapshot
        // by construction — but a null-guard keeps the arm total, falling back to
        // the resting pose. The position itself comes from the shared
        // `liveBodyPosition` site.
        const base = s.camera.base;
        const livePos = liveBodyPosition(focus, state.cameraRuntime.lastRenderedSimDays.current);
        // `base.frame` is the isActive gate restated as the narrowing TS needs;
        // returning `base` untouched is the resting floor's arm-agnostic answer.
        if (focus === null || focus.type !== 'body' || livePos === null) return base;
        if (base.frame !== 'absolute') return base;

        // Capture the `from` pose ONCE per activation. `followElapsed` nulls it
        // on the edge; the first produce after fills it from the LIVE rendered
        // pose (the previous frame's, not yet overwritten this frame) so the ease
        // starts where the camera visibly is — switching focus A→B eases from
        // framing-A, never jumping back to the committed base first.
        if (clock.followFrom === null) {
          const cur = liveWorldPose(state);
          clock.followFrom = {
            target: [cur.target[0], cur.target[1], cur.target[2]],
            yaw: cur.yaw,
            pitch: cur.pitch,
            distance: cur.distance,
            roll: cur.roll,
          };
        }
        const from = clock.followFrom;

        // Resolve the distance target for this frame (the two-source un-braid).
        if (clock.followDistanceTarget === null) {
          // Fresh focus (followElapsed nulled it): seed the INITIAL-APPROACH
          // target to the framing distance. Call `bodyFocusDistance` directly —
          // allocation-free, unlike `bodyLikeFraming`, which builds a FocusFraming
          // object + target array of which only `.distance` is read here. Computed
          // only in this branch, so the per-frame steady path skips the tan().
          const radiusMpc = focus.radiusM * SCALE_UNITS.M_TO_MPC;
          clock.followDistanceTarget = bodyFocusDistance(
            radiusMpc,
            state.cameraRuntime.projection.fovYRad,
          );
        } else if (state.cameraRuntime.prevActiveId.current !== 'followBody') {
          // Follow re-won this frame but was not last frame's winner, and the
          // focus ref is unchanged (else followDistanceTarget would be null): a
          // drag (or clip) interrupted the follow and committed a new pose into
          // `base`. Re-capture `base.distance` as the STEADY-STATE target so the
          // user's zoom sticks instead of snapping back to the framing distance.
          clock.followDistanceTarget = base.pose.distance;
        }
        const distanceTarget = clock.followDistanceTarget;

        const t = easeOutCubic(elapsed / FOCUS_TWEEN_MS);
        return absoluteArm({
          // Alias the live snapshot position (a fresh, immutable per-frame array
          // downstream reads read-only) — the target is the body, always. (The
          // frame-loop pivot-pin sets the same value; keeping it here means the
          // driver's pose is correct in isolation too.)
          target: livePos,
          yaw: lerp(from.yaw, base.pose.yaw, t),
          pitch: lerp(from.pitch, base.pose.pitch, t),
          distance: lerp(from.distance, distanceTarget, t),
        });
      },
    },
    {
      id: 'tween',
      priority: 60,
      // Bake the tween's final pose into `base` on deactivation so that a
      // tween-to-focus lands cleanly rather than snapping to the pre-tween base.
      // The baked pose is already re-encoded into the CURRENT frame below, so
      // commit-on-edge never bakes a stale pinned-frame reading.
      commitsOnEdge: true,
      isActive: (s) => s.camera.tween !== null,
      // `tween.frame` (pinned at dispatch time, same contract as `clip.frame`)
      // is the STEADY basis `from`/`to` were captured through. `tweenToClip`
      // converts the descriptor to a ClipData (memoised by reference) so
      // `evaluateClip`'s compile cache reuses tracks across frames; the result
      // is then re-encoded forward into the CURRENT frame — reencodePose
      // returns it by reference when the two bases match, the common case.
      pose: (s, _cam, elapsedMs) => {
        const tween = s.camera.tween!;
        const evaluated = evaluateClip(
          tweenToClip(tween),
          elapsedMs / 1000,
          ORIENTATION_FRAMES[tween.frame],
        );
        return absoluteArm(
          reencodePose(
            evaluated,
            ORIENTATION_FRAMES[tween.frame],
            ORIENTATION_FRAMES[s.settings.orientation],
          ),
        );
      },
    },
    {
      id: 'autoRotate',
      priority: 20,
      // Bake the spin's accumulated yaw into `base` when auto-rotate stops,
      // so resume picks up from the final heading rather than jumping back.
      commitsOnEdge: true,
      // Orbit driver: while a body is focused the pivot-pin re-centres the spin
      // on the live body, so auto-rotate orbits AROUND the focused body. This is
      // why followBody sits below autoRotate — the spin wins the orbit terms, the
      // body owns the pivot.
      pivotsOnFocusedBody: true,
      // World-arm producer, gated on the absolute arm (spec §7): a yaw spin
      // about the frame pole is not a thing a body-fixed arm expresses.
      isActive: (s) => s.camera.autoRotate.active && s.camera.base.frame === 'absolute',
      // Spins from the FROZEN base: base does not update while autoRotate wins
      // (commit-on-edge only fires on driver deactivation), so the yaw advances
      // at the correct cumulative rate rather than a per-frame delta off a
      // moving base.
      pose: (s, _cam, elapsedMs) => {
        const base = s.camera.base;
        // The isActive gate restated as the narrowing TS needs.
        if (base.frame !== 'absolute') return base;
        return absoluteArm(spinAutoRotate(base.pose, s.camera.autoRotate.rate, elapsedMs));
      },
    },
    {
      id: 'resting',
      priority: 0,
      // Orbit driver: the pivot-pin re-centres the resting pose on a focused
      // body. In practice followBody (10) outranks resting whenever a body focus
      // is pin-eligible, so this flag is belt-and-braces — it keeps the rule
      // 'every orbit driver pivots on the focused body' complete.
      pivotsOnFocusedBody: true,
      isActive: () => true,
      // At rest, the committed base IS the pose. No clock, no elapsed — pure
      // identity read from the store.
      pose: (s) => s.camera.base,
    },
  ];
}
