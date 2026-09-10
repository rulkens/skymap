/**
 * cameraDrivers — the camera-driver table and its resolver. Among the drivers
 * active this frame the highest `priority` wins and ONLY its `pose` is used:
 * one author per frame, no blending; precedence is data, not call order.
 * Priorities: clip 95 > orbitDrag 80 > tween 60 > followApproach 55 >
 * autoRotate 20 > followHold 10 > resting 0 (gaps are headroom). Body focus is
 * un-braided: the focused body owns the PIVOT (applied by the frame-loop pin to
 * every driver flagged `pivotsOnFocusedBody`), the winning driver owns the
 * orbit terms — which is why the follow HOLD sits below autoRotate and the drag.
 */

import type { CameraDriver } from '../../../@types/engine/camera/CameraDriver';
import type { DriverCtx } from '../../../@types/engine/camera/DriverCtx';
import type { FramedCameraPose } from '../../../@types/camera/FramedCameraPose';
import type { RootState } from '../../../store/types';
import type { CameraEpochs } from '../../../@types/engine/camera/CameraEpochs';
import type { FollowMemory } from '../../../@types/engine/camera/FollowMemory';
import type { Vec3 } from '../../../@types/math/Vec3';
import { absoluteArm } from '../../../utils/camera/absoluteArm';
import { eyeMpcOf } from '../../../utils/camera/eyeMpcOf';
import { orbitAnglesLookingAlong } from '../../../utils/camera/orbitAnglesLookingAlong';
import { tweenToClip } from './tweenToClip';
import { spinAutoRotate } from './spinAutoRotate';
import { elapsedMs } from './cameraEpochs';
import { evaluateClip } from './evaluateClip';
import { reencodePose } from '../../../utils/camera/reencodePose';
import { bodyFocusDistance } from './bodyFocusDistance';
import { ORIENTATION_FRAMES } from '../../../data/orientation/orientationFrames';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { FOCUS_TWEEN_MS } from './focusTweenDuration';
import { liveBodyPosition } from './liveBodyPosition';
import { bodyMovesThisFrame } from '../../../utils/scene/bodyMovesThisFrame';
import { easeOutCubic } from '../../../utils/math/easeOutCubic';
import { isFollowDriverId } from '../../../utils/camera/isFollowDriverId';
import { lerp } from '../../../utils/math/lerp';

/** The frame's single author: highest `priority` among the active rows. */
export function pickWinner(
  drivers: readonly CameraDriver[],
  s: RootState,
  approachDone = false,
): CameraDriver {
  let winner: CameraDriver | null = null;
  for (const d of drivers) {
    if (!d.isActive(s, approachDone)) continue;
    if (winner === null || d.priority > winner.priority) winner = d;
  }
  // Only an empty table reaches the fallback; `resting` is always active.
  return winner ?? drivers[0]!;
}

/** `epochs` must already be advanced for this frame (the step does it once, at the winner). */
export function elapsedForWinner(
  winner: CameraDriver,
  epochs: CameraEpochs,
  nowMs: number,
): number {
  return winner.epoch === undefined ? 0 : elapsedMs(epochs[winner.epoch], nowMs);
}

const NO_FOLLOW_MEMORY: FollowMemory = {
  from: null,
  distanceTarget: null,
  panOffset: [0, 0, 0],
  saturated: false,
};

/**
 * The follow conditions both follow rows share. Active only for a body the sim
 * clock MOVES: a static focus (a famous star, the Sun) carries a position but is
 * not followed. Gated on the absolute arm (spec §7): the ease has no meaning
 * once the state co-rotates with the body.
 */
function followActive(s: RootState): boolean {
  return s.camera.base.frame === 'absolute' && bodyMovesThisFrame(s.selectionRows.focus);
}

/**
 * One produce for both follow rows: same pose, same returned memory, and the
 * ease reads the same `follow` epoch. The approach yields only AFTER a frame it
 * saturated, so the hand-off pose is `lerp(_, _, 1)` on both sides — identical
 * bit for bit, whatever the frame phase.
 */
function followPose(
  ctx: DriverCtx,
  mem: FollowMemory | null,
): { readonly pose: FramedCameraPose; readonly memory: FollowMemory | null } {
  const s = ctx.state;
  const focus = s.selectionRows.focus;
  const base = s.camera.base;
  const livePos = liveBodyPosition(focus, ctx.simDays);
  // Null-guard keeps the arm total; isActive already proved a moving body.
  if (focus === null || focus.type !== 'body' || livePos === null) {
    return { pose: base, memory: mem };
  }
  if (base.frame !== 'absolute') return { pose: base, memory: mem };

  // Captured ONCE per activation (`runFrame` nulls the memory on the focus
  // edge) through the EYE, not the angles: `approachTiltedPose` is eye-preserving
  // by construction, so authored and displayed registers now yield an
  // identical capture (why eye, not angle, is carried across — R12b-1).
  // Eye-preserving against the NEW target: `from` is read against
  // `livePos` below, so a capture relative to the OLD target silently
  // changes meaning on a body switch — an Earth-orbit distance read from
  // Saturn's centre is INSIDE Saturn, where the fold engages and the
  // absolute-arm gate strands the camera.
  const memory = mem ?? NO_FOLLOW_MEMORY;
  let from = memory.from;
  if (from === null) {
    const cur = ctx.authoredWorld;
    const pb = ORIENTATION_FRAMES[s.settings.orientation];
    const eye = eyeMpcOf(cur, pb);
    const rel: Vec3 = [livePos[0] - eye[0], livePos[1] - eye[1], livePos[2] - eye[2]];
    const ang = orbitAnglesLookingAlong(rel, pb);
    from = {
      target: [livePos[0], livePos[1], livePos[2]],
      yaw: ang.yaw,
      pitch: ang.pitch,
      distance: Math.hypot(rel[0], rel[1], rel[2]),
      roll: cur.roll,
    };
  }

  // Distance target, two sources (see FollowMemory): a fresh focus seeds
  // the framing distance — `bodyFocusDistance` directly, allocation-free,
  // only on this branch; follow re-winning after a drag committed a zoom
  // (last frame's winner was some OTHER row, same focus ref) re-captures
  // `base.distance` so the zoom sticks.
  // A third source is the wheel: `base` is invisible while a follow row wins
  // (it re-asserts its own target every frame), so the notch a following
  // camera swallows arrives already resolved to a distance and is simply
  // adopted. The drain only routes one with a target already captured and
  // a follow row winning last frame, so the three sources never compete.
  let distanceTarget = memory.distanceTarget;
  if (distanceTarget === null) {
    const radiusMpc = focus.radiusM * SCALE_UNITS.M_TO_MPC;
    distanceTarget = bodyFocusDistance(radiusMpc, ctx.projection.fovYRad);
  } else if (!isFollowDriverId(ctx.winnerLastFrame)) {
    distanceTarget = base.pose.distance;
  } else if (ctx.followDistanceTarget !== null) {
    distanceTarget = ctx.followDistanceTarget;
  }

  const t = easeOutCubic(ctx.elapsedMs / FOCUS_TWEEN_MS);
  return {
    pose: absoluteArm({
      target: livePos,
      // Eases toward the committed `base`: honours a post-follow drag, keeps heading when un-dragged.
      yaw: lerp(from.yaw, base.pose.yaw, t),
      pitch: lerp(from.pitch, base.pose.pitch, t),
      distance: lerp(from.distance, distanceTarget, t),
      // Roll rides like yaw/pitch: the approach frame-alignment (ruling 8)
      // lands per wheel notch, and dropping it pinned a followed approach
      // to scene-frame up until the engage edge.
      roll: lerp(from.roll ?? 0, base.pose.roll ?? 0, t),
    }),
    memory: { from, distanceTarget, panOffset: memory.panOffset, saturated: t >= 1 },
  };
}

/** The seven rows. Constant data: a driver sees the frame only through its `ctx`. */
export const CAMERA_DRIVERS: readonly CameraDriver[] = [
  {
    id: 'clip',
    priority: 95,
    epoch: 'clip',
    // Holds the camera above orbitDrag in EITHER arm: a gesture handed back
    // to a clip whose commit-on-edge bakes its own final pose would be
    // discarded at pointerup (`replayInput` swallows the steps too).
    commitsOnEdge: true,
    isActive: (s) => s.camera.clip !== null,
    // `clip.frame` (pinned at dispatch) is the STEADY basis the path's
    // tangents encode through — a fixed reference keeps `evaluateClip`'s
    // compile cache stable across an orientation switch; the result is
    // re-encoded into the CURRENT frame (by reference when the bases match).
    pose: (ctx, mem) => {
      const s = ctx.state;
      const clip = s.camera.clip!;
      const evaluated = evaluateClip(
        clip.data,
        ctx.elapsedMs / 1000,
        ORIENTATION_FRAMES[clip.frame],
      );
      return {
        pose: absoluteArm(
          reencodePose(
            evaluated,
            ORIENTATION_FRAMES[clip.frame],
            ORIENTATION_FRAMES[s.settings.orientation],
          ),
        ),
        memory: mem,
      };
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
    pose: (ctx, mem) => ({ pose: ctx.register, memory: mem }),
  },
  {
    id: 'followApproach',
    // 55 keeps the two relationships that matter and nothing else: ABOVE
    // autoRotate (20), or the spin outranks a body switch and the camera never
    // approaches — it holds the old body's distance, which over Saturn is
    // inside the planet with the arm engaged (R14-3); BELOW tween (60), where
    // follow already yields to an explicitly authored move. Not 60: a tie is
    // broken by table order, which is order-dependence, not policy.
    priority: 55,
    epoch: 'follow',
    // Bakes the last follow pose into `base` on focus loss, so lower drivers
    // resume from where the camera is.
    commitsOnEdge: true,
    // Idempotent (the pose already targets the body); keeps the pin's rule uniform.
    pivotsOnFocusedBody: true,
    isActive: (s, approachDone = false) => followActive(s) && !approachDone,
    pose: followPose,
  },
  {
    id: 'followHold',
    // The steady follow, back under autoRotate and the drag: once the approach
    // is saturated the row only re-asserts the body's own target, which the
    // pivot pin gives those drivers anyway.
    priority: 10,
    epoch: 'follow',
    commitsOnEdge: true,
    pivotsOnFocusedBody: true,
    isActive: followActive,
    pose: followPose,
  },
  {
    id: 'tween',
    priority: 60,
    epoch: 'tween',
    // Bakes the final pose on deactivation; it is already in the CURRENT
    // frame, so the commit never bakes a stale pinned-frame reading.
    commitsOnEdge: true,
    isActive: (s) => s.camera.tween !== null,
    // `tween.frame` (pinned at dispatch) is the STEADY basis `from`/`to` were
    // captured through; `tweenToClip` memoises by reference so
    // `evaluateClip`'s compile cache reuses tracks across frames.
    pose: (ctx, mem) => {
      const s = ctx.state;
      const tween = s.camera.tween!;
      const evaluated = evaluateClip(
        tweenToClip(tween),
        ctx.elapsedMs / 1000,
        ORIENTATION_FRAMES[tween.frame],
      );
      return {
        pose: absoluteArm(
          reencodePose(
            evaluated,
            ORIENTATION_FRAMES[tween.frame],
            ORIENTATION_FRAMES[s.settings.orientation],
          ),
        ),
        memory: mem,
      };
    },
  },
  {
    id: 'autoRotate',
    priority: 20,
    epoch: 'autoRotate',
    commitsOnEdge: true,
    pivotsOnFocusedBody: true,
    // Absolute arm only (spec §7): a yaw spin about the frame pole is not a
    // thing a body-fixed arm expresses.
    isActive: (s) => s.camera.autoRotate.active && s.camera.base.frame === 'absolute',
    // Spins from the FROZEN base (it only changes on a commit edge), so yaw
    // advances at the cumulative rate, not a per-frame delta off a moving base.
    pose: (ctx, mem) => {
      const base = ctx.state.camera.base;
      // The isActive gate restated as the narrowing TS needs.
      if (base.frame !== 'absolute') return { pose: base, memory: mem };
      return {
        pose: absoluteArm(
          spinAutoRotate(base.pose, ctx.state.camera.autoRotate.rate, ctx.elapsedMs),
        ),
        memory: mem,
      };
    },
  },
  {
    id: 'resting',
    priority: 0,
    // Pivots too, so 'every orbit driver pivots on the focused body' holds without exception.
    pivotsOnFocusedBody: true,
    isActive: () => true,
    pose: (ctx, mem) => ({ pose: ctx.state.camera.base, memory: mem }),
  },
];
