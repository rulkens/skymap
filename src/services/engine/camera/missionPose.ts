/**
 * missionPose — the mission driver's pose: the mission frame at this frame's instant, looked at
 * along its normal turned by the visitor's offsets. A view change (a step, a craft switch, a
 * hand-off to another stop or view regime) eases from the pose last shown over `MISSION_EASE_MS`
 * of WALL time on the mission epoch, so it reads the same at every clock speed and still finishes
 * on a paused clock. Offsets are read back from a released drag or a swallowed wheel notch and
 * ease back to zero after `MISSION_EASE_MS` idle. Yaw and pitch come from
 * `orbitAnglesLookingAlong` in the committed basis; an inverse here would drift off-equatorial.
 */

import type { BodyId } from '../../../@types/data/body/BodyId';
import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { DriverCtx } from '../../../@types/engine/camera/DriverCtx';
import type { FollowMemory } from '../../../@types/engine/camera/FollowMemory';
import type { FramedCameraPose } from '../../../@types/camera/FramedCameraPose';
import type { MissionOffsets } from '../../../@types/camera/MissionOffsets';
import { MISSION_EASE_MS } from '../../../data/exhibits/mission/missionEaseMs';
import { MISSION_FRAME_MARGIN } from '../../../data/exhibits/mission/missionFrameMargin';
import { NO_MISSION_OFFSETS } from '../../../data/exhibits/mission/noMissionOffsets';
import { setMissionOffsets } from '../../../state/camera/cameraSlice';
import { absoluteArm } from '../../../utils/camera/absoluteArm';
import { blendCameraPose } from '../../../utils/camera/blendCameraPose';
import { eyeMpcOf } from '../../../utils/camera/eyeMpcOf';
import { missionCameraFrame } from '../../../utils/camera/missionCameraFrame';
import { missionOffsetsOfView } from '../../../utils/camera/missionOffsetsOfView';
import { missionViewDirection } from '../../../utils/camera/missionViewDirection';
import { orbitAnglesLookingAlong } from '../../../utils/camera/orbitAnglesLookingAlong';
import { sphereFitDistance } from '../../../utils/camera/sphereFitDistance';
import { normalize3 } from '../../../utils/math/normalize3';
import { smoothstep } from '../../../utils/math/smoothstep';

export function missionPose(
  ctx: DriverCtx,
  mem: FollowMemory | null,
): {
  readonly pose: FramedCameraPose;
  readonly memory: FollowMemory | null;
  readonly actions?: readonly ReturnType<typeof setMissionOffsets>[];
} {
  const mission = ctx.state.camera.mission;
  if (mission === null) return { pose: ctx.state.camera.base, memory: mem };
  const now = ctx.elapsedMs;
  const { fovYRad, aspect } = ctx.projection;
  const positionOf = (id: string) => ctx.bodies.get(id as BodyId)?.positionMpc;
  // A new mission record (entry, step, craft switch) also restarts the epoch these times are on.
  const prev = mem?.mission?.stops === mission.stops ? mem.mission : null;
  const frame = missionCameraFrame(
    mission,
    ctx.simDays,
    positionOf,
    fovYRad,
    aspect,
    ctx.poseBasis,
    prev?.cruise ?? null,
  );
  if (frame === null) return { pose: ctx.state.camera.base, memory: mem };

  let inputAtMs = prev?.inputAtMs ?? now;
  const stored = mission.offsets;
  const storedIsZero = stored.yaw === 0 && stored.pitch === 0 && stored.zoom === 1;
  const idle = smoothstep(MISSION_EASE_MS, 2 * MISSION_EASE_MS, now - inputAtMs);
  const keep = 1 - idle;
  let offsets: MissionOffsets =
    idle === 0
      ? stored
      : idle === 1
        ? NO_MISSION_OFFSETS
        : { yaw: stored.yaw * keep, pitch: stored.pitch * keep, zoom: stored.zoom ** keep };
  const dragged = ctx.winnerLastFrame === 'orbitDrag';
  const touched = dragged || ctx.followDistanceTarget !== null;
  if (dragged) {
    // The drag edge committed the dragged register; its view and distance ARE the new offsets.
    const w = ctx.committedWorld;
    const eye = eyeMpcOf(w, ctx.poseBasis);
    const view = normalize3([w.target[0] - eye[0], w.target[1] - eye[1], w.target[2] - eye[2]]);
    offsets = missionOffsetsOfView(frame, view, w.distance);
  } else if (ctx.followDistanceTarget !== null) {
    // Relative to the eased-back offsets the visitor sees, so a notch mid-ease does not jump.
    offsets = { ...offsets, zoom: ctx.followDistanceTarget / frame.distance };
  }
  if (touched) inputAtMs = now;

  // The distance that fits the craft's frame sphere about `target`, as the exact frame does.
  const craft = positionOf(mission.craftId);
  const fitAbout = (target: Readonly<Vec3>): number =>
    craft === undefined
      ? 0
      : sphereFitDistance(
          Math.hypot(craft[0] - target[0], craft[1] - target[1], craft[2] - target[2]) *
            MISSION_FRAME_MARGIN,
          fovYRad,
          aspect,
        ) * offsets.zoom;

  // A first frame eases only after a re-aim (an entry cuts or arrives on a fly-in); a view change
  // or a drag released mid-ease starts again from what the visitor sees, so nothing jumps.
  let from = prev?.from ?? null;
  let easeAtMs = prev?.easeAtMs ?? now;
  let shortfall = prev?.shortfall ?? 1;
  const easing = from !== null && now - easeAtMs < MISSION_EASE_MS;
  const viewChanged = prev !== null && (frame.stop !== prev.stop || frame.cruise !== prev.cruise);
  if (prev === null ? mission.retarget > 0 : viewChanged || (dragged && easing)) {
    from = ctx.authoredWorld;
    easeAtMs = now;
    shortfall = Math.min(1, from.distance / fitAbout(from.target));
  } else if (!easing) from = null;

  const distance = frame.distance * offsets.zoom;
  const { yaw, pitch } = orbitAnglesLookingAlong(
    missionViewDirection(frame, offsets),
    ctx.poseBasis,
  );
  const exact = { target: frame.aim, yaw, pitch, distance };
  let shown: CameraPose = exact;
  if (from !== null) {
    const s = smoothstep(0, MISSION_EASE_MS, now - easeAtMs);
    const blend = blendCameraPose(from, exact, s);
    // A blended centre can leave the craft outside a log-blended distance, so the distance never
    // falls under the craft's fit. A step jumps the clock, leaving the craft out of the start
    // pose; that shortfall fades over the ease rather than snapping out on its first frame.
    const floor = fitAbout(blend.target) * shortfall ** (1 - s);
    shown = { ...blend, distance: Math.max(blend.distance, floor) };
  }

  return {
    pose: absoluteArm(shown),
    // The wheel only routes a notch to a row whose memory names its distance; `saturated`
    // false keeps the render loop awake through an ease on a paused clock.
    memory: {
      from: null,
      distanceTarget: distance,
      panOffset: mem?.panOffset ?? [0, 0, 0],
      saturated: from === null && storedIsZero,
      mission: {
        stops: mission.stops,
        stop: frame.stop,
        cruise: frame.cruise,
        from,
        easeAtMs,
        shortfall,
        inputAtMs,
      },
    },
    actions: touched || (idle === 1 && !storedIsZero) ? [setMissionOffsets(offsets)] : undefined,
  };
}
