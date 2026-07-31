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
 * Redux store. Most drivers' `isActive` read only `s.camera.*`; `cam` is
 * forwarded to the `orbitDrag` driver, which reads `state.cam` (the gesture
 * register) for its live yaw/pitch/distance. `buildCameraDrivers(state)` closes
 * over `EngineState` for the live lens FOV (`clip`, `tween` and `followBody`
 * all read `state.cameraRuntime.projection.fovYRad`) and, for `followBody`
 * alone, the per-frame body-state snapshot and the follow ease clock.
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
 * initial approach + the idle steady hold, which it authors when nothing higher
 * is active. A held drag or an active spin takes the orbit terms; the pin keeps
 * the body centred throughout.
 *
 * Three rows are NOT pinned — clip@95, tween@60 and followBody@10 — for one
 * shared reason: each keyframes a full path INCLUDING the target, so an absolute
 * pin would discard it. clip and tween produce theirs through `evaluateClip` (the
 * tween via `tweenToClip`), differing only in priority and which `camera.*`
 * descriptor they read. followBody produces its approach through `glidePath`, the
 * same zoom/pan geodesic, off clock state rather than a store descriptor because
 * its endpoint is a body the sim clock keeps moving.
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
import { bodyFocusDistance } from './bodyFocusDistance';
import { ORIENTATION_FRAMES } from '../../../data/orientation/orientationFrames';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { liveBodyPosition } from './liveBodyPosition';
import { focusedBodyPivot } from './focusedBodyPivot';
import { glidePath } from '../../../utils/camera/glidePath';
import { selectGlideTuning } from '../../../state/settings/selectors';
import { lerp } from '../../../utils/math/lerp';
import { EASE } from '../animation/ease';

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
 *     `pivotsOnFocusedBody`: while a body is focused the pivot-pin overwrites the
 *     dragged target with the live body, so a drag orbits around the moving body
 *     (no drift) rather than a frozen point.
 *
 *   - `followBody` (10) — a focus on a moving scene body. Active while
 *     `s.selectionRows.focus` is a body present in this frame's body snapshot
 *     (resolved via the shared `liveBodyPosition` site). Sits BELOW autoRotate
 *     so it only wins when the scene is otherwise idle: its remaining job is the
 *     initial approach + the steady hold. On activation it glides `target` and
 *     `distance` together, from the captured on-screen pose to the live body at
 *     its `bodyFocusDistance` framing distance, over a duration derived from that
 *     geodesic's arc length and parked on `clock.followApproachMs`. Once a drag
 *     has committed a zoom into `base` (or a wheel edited
 *     `clock.followDistanceTarget` directly), follow holds that user distance
 *     instead (the two distance sources are un-braided via
 *     `clock.followDistanceTarget` — see CameraClock), so zoom-while-following is
 *     preserved rather than the framing distance being re-asserted each frame.
 *     `commitsOnEdge: true` bakes the last follow pose into `base` on
 *     deactivation, so lower drivers resume from where the camera is (no snap-
 *     back). The moving-target problem that once forced follow to own the whole
 *     pose is now solved by the shared pivot-pin for the OTHER orbit drivers, so
 *     follow no longer needs to outrank autoRotate / the drag.
 *
 *   - `tween` (60) — an in-flight focus tween. Active while `s.camera.tween`
 *     is non-null. Reads `s.camera.tween` + `elapsedMs` from the clock and the
 *     live `fovYRad`, converts descriptor via `tweenToClip`, calls
 *     `evaluateClip(data, elapsed/1000, undefined, fovYRad)`.
 *
 *   - `autoRotate` (20) — the idle drift. Active while
 *     `s.camera.autoRotate.active` is true. Pure: returns
 *     `spinAutoRotate(s.camera.base, rate, elapsedMs)` — base is frozen while
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
      // takes elapsedSec. See the UNIT NOTE in elapsedForWinner. The STEADY
      // orientation basis is passed so a flyPath's world tangents encode to
      // (yaw, pitch) through the committed frame the render path decodes with —
      // a world-invariant aim (see buildPathTrack / orbitAnglesLookingAlong).
      pose: (s, _cam, elapsed) =>
        evaluateClip(
          s.camera.clip!.data,
          elapsed,
          ORIENTATION_FRAMES[s.settings.orientation],
          state.cameraRuntime.projection.fovYRad,
        ),
    },
    {
      id: 'orbitDrag',
      priority: 80,
      // Orbit driver: while a body is focused the frame loop pins the pose target
      // to the live body so a drag orbits AROUND the moving body instead of a
      // frozen point (the body would otherwise drift out from under the cursor
      // mid-drag). Drag owns yaw/pitch/distance; the body owns the pivot.
      pivotsOnFocusedBody: true,
      isActive: (s) => s.camera.dragging,
      // The live drag register is the source of truth while the gesture is
      // held — poseOf reads yaw/pitch/distance/target off the OrbitCamera
      // that orbitControls mutates in real time. The target it reads is only
      // used when NO body is focused; otherwise the pivot-pin overwrites it.
      pose: (_s, cam) => poseOf(cam),
    },
    {
      id: 'followBody',
      priority: 10,
      // Leaving focus (null / a non-body row) deactivates the row; the last
      // follow pose is baked into `base` so lower drivers resume from where the
      // camera actually is rather than snapping back to the pre-focus base.
      commitsOnEdge: true,
      // NO `pivotsOnFocusedBody` — deliberately, and for the same reason clip and
      // tween opt out: follow keyframes a full path INCLUDING the target. The pin
      // SETS `target = body + panOffset` absolutely, which would overwrite the
      // approach's interpolated target every frame and snap the pivot. The strafe
      // the pin used to add is added by `pose` instead (see below).

      // Active when the focus resolves to a scene body present in THIS frame's
      // body snapshot (resolved through the shared `liveBodyPosition` site).
      // The snapshot is the memoized `deriveBodyStates` map at the instant
      // `runFrame` derived this frame's bodies (`lastRenderedSimDays.current`,
      // written before produce) — a same-instant call returns the cached Map for
      // free. A star / structure / galaxy focus is not a body, so this stays
      // false. Priority 10 (below autoRotate 20) means followBody only wins when
      // idle: autoRotate or a drag takes the orbit terms while the pivot-pin
      // keeps the body centred, so the autoRotate button spins AROUND a focused
      // body instead of being blocked by follow.
      // Short-circuit on a non-body focus BEFORE touching the snapshot resource,
      // so this stays cheap (and null-safe pre-bootstrap) for the common
      // no-body-focus frame; only a body focus resolves the live position.
      isActive: (s) => {
        const focus = s.selectionRows.focus;
        if (focus === null || focus.type !== 'body') return false;
        return liveBodyPosition(focus, state.cameraRuntime.lastRenderedSimDays.current) !== null;
      },
      // The follow pose. `elapsed` is ms since the approach started (from
      // `followElapsed`, keyed on the focus row reference).
      //
      // The APPROACH glides `target` and `distance` together along one zoom/pan
      // geodesic, so perceived velocity stays constant while the camera crosses
      // ~15 decades of scale; yaw/pitch stay independent scalar lerps beside it
      // (spec §5.2 — angles are scale-free). The STEADY HOLD past saturation is
      // the body plus the pan strafe, at the resolved distance target.
      //
      // Distance has TWO sources, un-braided via `clock.followDistanceTarget`
      // (see CameraClock): an INITIAL APPROACH glides into the framing distance;
      // once a drag has committed a zoom into `base`, follow holds THAT committed
      // `base.distance` instead, so the user can zoom while following rather than
      // having the framing distance re-asserted every frame.
      pose: (s, _cam, elapsed) => {
        const focus = s.selectionRows.focus;
        const clock = state.cameraRuntime.clock;
        // The pivot follow holds: the live body plus the world-frame strafe the
        // user panned away from it (zeroed on a fresh focus). Read through the
        // SAME `focusedBodyPivot` the frame-loop pin uses; follow opts out of the
        // pin only so it can interpolate the pivot, not to author a different one.
        //
        // Defensive null-guard: pose only runs for the winner, so isActive already
        // proved a body focus present in the snapshot this same frame — but the
        // guard keeps the arm total, falling back to the resting pose.
        const pivot = focusedBodyPivot(
          focus,
          state.cameraRuntime.lastRenderedSimDays.current,
          clock.followPanOffset,
        );
        if (focus === null || focus.type !== 'body' || pivot === null) return s.camera.base;

        // Capture the `from` pose ONCE per activation. `followElapsed` nulls it
        // on the edge; the first produce after fills it from the LIVE rendered
        // pose (the previous frame's, not yet overwritten this frame) so the
        // approach starts where the camera visibly is — switching focus A→B
        // glides from framing-A, never jumping back to the committed base first.
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
        const fovYRad = state.cameraRuntime.projection.fovYRad;

        // Resolve the distance target for this frame (the two-source un-braid).
        if (clock.followDistanceTarget === null) {
          // Fresh focus (followElapsed nulled it): seed the INITIAL-APPROACH
          // target to the framing distance. Call `bodyFocusDistance` directly —
          // allocation-free, unlike `bodyLikeFraming`, which builds a FocusFraming
          // object + target array of which only `.distance` is read here. Computed
          // only in this branch, so the per-frame steady path skips the tan().
          const radiusMpc = focus.radiusKm * SCALE_UNITS.KM_TO_MPC;
          const framing = bodyFocusDistance(radiusMpc, fovYRad);
          clock.followDistanceTarget = framing;
          // Derive the approach duration ONCE, here, from the activation frame's
          // geodesic — `shouldKeepTicking` gates the render loop on this same
          // field, so a duration re-derived per frame would drift out from under
          // the wake window and freeze the approach part-way.
          clock.followApproachMs =
            glidePath(from, { target: pivot, distance: framing }, fovYRad, selectGlideTuning(s))
              .durationSec * 1000;
        } else if (state.cameraRuntime.prevActiveId.current !== 'followBody') {
          // Follow re-won this frame but was not last frame's winner, and the
          // focus ref is unchanged (else followDistanceTarget would be null): a
          // drag (or clip) interrupted the follow and committed a new pose into
          // `base`. Re-capture `base.distance` as the STEADY-STATE target so the
          // user's zoom sticks instead of snapping back to the framing distance.
          clock.followDistanceTarget = base.distance;
          // …and the approach is OVER. The drag already put the camera where the
          // user wants it; resuming a half-flown geodesic out of the now-stale
          // `followFrom` would yank it back to the pre-drag path.
          clock.followApproachMs = 0;
        }
        const distanceTarget = clock.followDistanceTarget;
        // `?? 0` — no duration seeded means no approach to run, so hold steady.
        const approachMs = clock.followApproachMs ?? 0;

        // Saturated, or ended by the drag edge above ⇒ hold the body steady.
        if (elapsed >= approachMs) {
          return { target: pivot, yaw: base.yaw, pitch: base.pitch, distance: distanceTarget };
        }

        // Re-measured EVERY approach frame, from the FIXED capture to the CURRENT
        // pivot — the body moves under the approach, and a geodesic re-measured
        // to a moved endpoint is what absorbs that (van Wijk & Nuij recommend
        // stateless recomputation for exactly this reason). Geodesics are unique,
        // so a sub-frame endpoint shift perturbs the curve by the same order.
        // Only the DURATION is frozen, above — moving the ρ slider mid-approach
        // therefore re-shapes the path but not its length, which is the same
        // trade the wake window forces.
        const t = elapsed / approachMs;
        const tuning = selectGlideTuning(s);
        // The eased fraction, not raw `t`: glidePath.at() takes an arc-length
        // FRACTION with no ease baked in (see glidePath.ts), so the driver must
        // reparametrise it itself — `tweenToClip`'s glide gets this for free from
        // `buildGlideTrack`, but the follow driver samples `glidePath` directly.
        // Applied to yaw/pitch too, matching tweenToClip's uniform ease across
        // target/distance/yaw/pitch for a focus tween.
        const easedT = EASE[tuning.ease](t);
        const glided = glidePath(
          from,
          { target: pivot, distance: distanceTarget },
          fovYRad,
          tuning,
        ).at(easedT);
        return {
          target: glided.target,
          yaw: lerp(from.yaw, base.yaw, easedT),
          pitch: lerp(from.pitch, base.pitch, easedT),
          distance: glided.distance,
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
      pose: (s, _cam, elapsedMs) =>
        evaluateClip(
          tweenToClip(s.camera.tween!),
          elapsedMs / 1000,
          undefined,
          state.cameraRuntime.projection.fovYRad,
        ),
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
