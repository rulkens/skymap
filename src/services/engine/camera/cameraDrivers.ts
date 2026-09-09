/**
 * cameraDrivers — the camera-driver table and its resolver. Among the drivers
 * active this frame the highest `priority` wins and ONLY its `pose` is used:
 * one author per frame, no blending; precedence is data, not call order.
 * Priorities: clip 95 > orbitDrag 80 > tween 60 > autoRotate 20 > followBody
 * 10 > resting 0 (gaps are headroom). Body focus is un-braided: the focused
 * body owns the PIVOT (applied by the frame-loop pin to every driver flagged
 * `pivotsOnFocusedBody`), the winning driver owns the orbit terms — which is
 * why followBody sits below autoRotate and the drag.
 */

import type { CameraDriver } from '../../../@types/engine/camera/CameraDriver';
import type { FramedCameraPose } from '../../../@types/camera/FramedCameraPose';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { RootState } from '../../../store/types';
import type { CameraClock } from '../../../@types/engine/camera/CameraClock';
import type { Vec3 } from '../../../@types/math/Vec3';
import { absoluteArm } from '../../../utils/camera/absoluteArm';
import { eyeMpcOf } from '../../../utils/camera/eyeMpcOf';
import { orbitAnglesLookingAlong } from '../../../utils/camera/orbitAnglesLookingAlong';
import { authoredWorldPose } from '../helpers/authoredWorldPose';
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

/** Exported so `activeDriverId` resolves the SAME winner the produce step used. */
export function pickWinner(drivers: readonly CameraDriver[], s: RootState): CameraDriver {
  let winner: CameraDriver | null = null;
  for (const d of drivers) {
    if (!d.isActive(s)) continue;
    if (winner === null || d.priority > winner.priority) winner = d;
  }
  // Only an empty table reaches the fallback; `resting` is always active.
  return winner ?? drivers[0]!;
}

/**
 * UNIT NOTE: each driver reads the value in its own unit — `clip` expects
 * SECONDS (`evaluateClip`'s `elapsedSec`), the easing drivers ms. Do not
 * "fix" the clip arm to multiply by 1000.
 */
function elapsedForWinner(
  winner: CameraDriver,
  s: RootState,
  clock: CameraClock,
  nowMs: number,
): number {
  if (winner.id === 'clip') return clipElapsed(clock, s.camera.clip, nowMs); // returns SECONDS
  if (winner.id === 'tween') return tweenElapsed(clock, s.camera.tween, nowMs);
  if (winner.id === 'autoRotate')
    return autoRotateElapsed(clock, s.camera.autoRotate.active, s.camera.base, nowMs);
  if (winner.id === 'followBody') return followElapsed(clock, s.selectionRows.focus, nowMs);
  return 0;
}

/**
 * The elapsed helpers mutate `clock` (identity-reset), so this must be the
 * sole per-frame caller of them.
 */
export function runCameraDrivers(
  drivers: readonly CameraDriver[],
  s: RootState,
  clock: CameraClock,
  nowMs: number,
): FramedCameraPose {
  const winner = pickWinner(drivers, s);
  const elapsed = elapsedForWinner(winner, s, clock, nowMs);
  return winner.pose(s, elapsed);
}

/**
 * The six-row table. `state` is closed over by `orbitDrag` (the live gesture
 * register) and `followBody` (the body snapshot, lens FOV and follow clock);
 * the other rows read only `RootState`.
 */
export function buildCameraDrivers(state: EngineState): readonly CameraDriver[] {
  return [
    {
      id: 'clip',
      priority: 95,
      // Holds the camera above orbitDrag in EITHER arm: a gesture handed back
      // to a clip whose commit-on-edge bakes its own final pose would be
      // discarded at pointerup (`drainInput` swallows the steps too).
      commitsOnEdge: true,
      isActive: (s) => s.camera.clip !== null,
      // `elapsed` is SECONDS. `clip.frame` (pinned at dispatch) is the STEADY
      // basis the path's tangents encode through — a fixed reference keeps
      // `evaluateClip`'s compile cache stable across an orientation switch;
      // the result is re-encoded into the CURRENT frame (by reference when
      // the bases match).
      pose: (s, elapsed) => {
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
      // The pin overwrites the dragged target with the live body, so a drag
      // orbits AROUND a moving body; a no-op on a body arm, so one row serves
      // both arms.
      pivotsOnFocusedBody: true,
      isActive: (s) => s.camera.dragging,
      // The AUTHORED register, pre-projection (R12b-1): producing the displayed
      // pose here re-pins its tilted angles and walks the eye every held frame.
      pose: () => state.cameraRuntime.lastPose.current,
    },
    {
      id: 'followBody',
      priority: 10,
      // Bakes the last follow pose into `base` on focus loss, so lower drivers
      // resume from where the camera is.
      commitsOnEdge: true,
      // Idempotent (the pose already targets the body); keeps the pin's rule uniform.
      pivotsOnFocusedBody: true,
      // Active only for a body the sim clock MOVES: a static focus (a famous
      // star, the Sun) carries a position but is not followed. Gated on the
      // absolute arm (spec §7): the ease has no meaning once the state
      // co-rotates with the body.
      isActive: (s) =>
        s.camera.base.frame === 'absolute' && bodyMovesThisFrame(s.selectionRows.focus),
      pose: (s, elapsed) => {
        const focus = s.selectionRows.focus;
        const clock = state.cameraRuntime.clock;
        const base = s.camera.base;
        const livePos = liveBodyPosition(focus, state.cameraRuntime.lastRenderedSimDays.current);
        // Null-guard keeps the arm total; isActive already proved a moving body.
        if (focus === null || focus.type !== 'body' || livePos === null) return base;
        if (base.frame !== 'absolute') return base;

        // Captured ONCE per activation (`followElapsed` nulls it on the edge)
        // through the EYE, not the angles: `approachTiltedPose` is eye-preserving
        // by construction, so authored and displayed registers now yield an
        // identical capture (why eye, not angle, is carried across — R12b-1).
        // Eye-preserving against the NEW target: `from` is read against
        // `livePos` below, so a capture relative to the OLD target silently
        // changes meaning on a body switch — an Earth-orbit distance read from
        // Saturn's centre is INSIDE Saturn, where the fold engages and the
        // absolute-arm gate strands the camera.
        if (clock.followFrom === null) {
          const cur = authoredWorldPose(state);
          const pb = ORIENTATION_FRAMES[state.settings.orientation];
          const eye = eyeMpcOf(cur, pb);
          const rel: Vec3 = [livePos[0] - eye[0], livePos[1] - eye[1], livePos[2] - eye[2]];
          const ang = orbitAnglesLookingAlong(rel, pb);
          clock.followFrom = {
            target: [livePos[0], livePos[1], livePos[2]],
            yaw: ang.yaw,
            pitch: ang.pitch,
            distance: Math.hypot(rel[0], rel[1], rel[2]),
            roll: cur.roll,
          };
        }
        const from = clock.followFrom;

        // Distance target, two sources (see CameraClock): a fresh focus seeds
        // the framing distance — `bodyFocusDistance` directly, allocation-free,
        // only on this branch; follow re-winning after a drag committed a zoom
        // (`prevActiveId !== 'followBody'`, same focus ref) re-captures
        // `base.distance` so the zoom sticks.
        if (clock.followDistanceTarget === null) {
          const radiusMpc = focus.radiusM * SCALE_UNITS.M_TO_MPC;
          clock.followDistanceTarget = bodyFocusDistance(
            radiusMpc,
            state.cameraRuntime.projection.fovYRad,
          );
        } else if (state.cameraRuntime.prevActiveId.current !== 'followBody') {
          clock.followDistanceTarget = base.pose.distance;
        }
        const distanceTarget = clock.followDistanceTarget;

        const t = easeOutCubic(elapsed / FOCUS_TWEEN_MS);
        return absoluteArm({
          target: livePos,
          // Eases toward the committed `base`: honours a post-follow drag, keeps heading when un-dragged.
          yaw: lerp(from.yaw, base.pose.yaw, t),
          pitch: lerp(from.pitch, base.pose.pitch, t),
          distance: lerp(from.distance, distanceTarget, t),
          // Roll rides like yaw/pitch: the approach frame-alignment (ruling 8)
          // lands per wheel notch, and dropping it pinned a followed approach
          // to scene-frame up until the engage edge.
          roll: lerp(from.roll ?? 0, base.pose.roll ?? 0, t),
        });
      },
    },
    {
      id: 'tween',
      priority: 60,
      // Bakes the final pose on deactivation; it is already in the CURRENT
      // frame, so the commit never bakes a stale pinned-frame reading.
      commitsOnEdge: true,
      isActive: (s) => s.camera.tween !== null,
      // `tween.frame` (pinned at dispatch) is the STEADY basis `from`/`to` were
      // captured through; `tweenToClip` memoises by reference so
      // `evaluateClip`'s compile cache reuses tracks across frames.
      pose: (s, elapsedMs) => {
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
      commitsOnEdge: true,
      pivotsOnFocusedBody: true,
      // Absolute arm only (spec §7): a yaw spin about the frame pole is not a
      // thing a body-fixed arm expresses.
      isActive: (s) => s.camera.autoRotate.active && s.camera.base.frame === 'absolute',
      // Spins from the FROZEN base (it only changes on a commit edge), so yaw
      // advances at the cumulative rate, not a per-frame delta off a moving base.
      pose: (s, elapsedMs) => {
        const base = s.camera.base;
        // The isActive gate restated as the narrowing TS needs.
        if (base.frame !== 'absolute') return base;
        return absoluteArm(spinAutoRotate(base.pose, s.camera.autoRotate.rate, elapsedMs));
      },
    },
    {
      id: 'resting',
      priority: 0,
      // Pivots too, so 'every orbit driver pivots on the focused body' holds without exception.
      pivotsOnFocusedBody: true,
      isActive: () => true,
      pose: (s) => s.camera.base,
    },
  ];
}
