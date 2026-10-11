/**
 * missionPose — the mission driver's pose: the mission frame at this frame's instant, looked at
 * along its normal turned by the visitor's offsets. A view change (a step, a craft switch, a
 * hand-off to another stop or view regime) eases from the pose last shown over `MISSION_EASE_MS`
 * of WALL time on the mission epoch, so it reads the same at every clock speed and still finishes
 * on a paused clock. Offsets are read from a live drag or a swallowed wheel notch and hold until
 * the next view change, which resets them. Yaw and pitch come from
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
import { MISSION_SURFACE_STANDOFF } from '../../../data/exhibits/mission/missionSurfaceStandoff';
import { MISSION_FRAME_MARGIN } from '../../../data/exhibits/mission/missionFrameMargin';
import { NO_MISSION_OFFSETS } from '../../../data/exhibits/mission/noMissionOffsets';
import { setMissionOffsets } from '../../../state/camera/cameraSlice';
import { absoluteArm } from '../../../utils/camera/absoluteArm';
import { blendCameraPose } from '../../../utils/camera/blendCameraPose';
import { bodyRadiusMpc } from '../../../utils/camera/bodyRadiusMpc';
import { distanceOutsideSphere } from '../../../utils/camera/distanceOutsideSphere';
import { eyeMpcOf } from '../../../utils/camera/eyeMpcOf';
import { missionCameraFrame } from '../../../utils/camera/missionCameraFrame';
import { missionOffsetsOfView } from '../../../utils/camera/missionOffsetsOfView';
import { missionViewDirection } from '../../../utils/camera/missionViewDirection';
import { orbitAnglesLookingAlong } from '../../../utils/camera/orbitAnglesLookingAlong';
import { sphereFitDistance } from '../../../utils/camera/sphereFitDistance';
import { lerpVec3 } from '../../../utils/math/lerpVec3';
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

  // A new view (another framed stop, or flyby to cruise and back) starts on its auto view; the
  // ease into it below departs from what the visitor saw, so the reset does not snap.
  const viewChanged = prev !== null && (frame.stop !== prev.stop || frame.cruise !== prev.cruise);
  let offsets: MissionOffsets = viewChanged ? NO_MISSION_OFFSETS : mission.offsets;
  const dragged = ctx.state.camera.dragging;
  const touched = dragged || ctx.followDistanceTarget !== null;
  if (dragged) {
    // The drag rung stepped last frame's pose; its view and distance ARE the new offsets, re-posed
    // below about this frame's aim, so the craft stays put on screen while the clock plays.
    const w = ctx.authoredWorld;
    const eye = eyeMpcOf(w, ctx.poseBasis);
    const view = normalize3([w.target[0] - eye[0], w.target[1] - eye[1], w.target[2] - eye[2]]);
    offsets = missionOffsetsOfView(frame, view, w.distance);
  } else if (ctx.followDistanceTarget !== null) {
    offsets = { ...offsets, zoom: ctx.followDistanceTarget / frame.distance };
  }

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
  // starts again from what the visitor sees, so nothing jumps.
  let from = prev?.from ?? null;
  let easeAtMs = prev?.easeAtMs ?? now;
  let shortfall = prev?.shortfall ?? 1;
  const easing = from !== null && now - easeAtMs < MISSION_EASE_MS;
  if (prev === null ? mission.retarget > 0 : viewChanged) {
    from = ctx.authoredWorld;
    easeAtMs = now;
    shortfall = Math.min(1, from.distance / fitAbout(from.target));
  } else if (!easing) from = null;

  const distance = frame.distance * offsets.zoom;
  const { yaw, pitch } = orbitAnglesLookingAlong(
    missionViewDirection(frame, offsets),
    ctx.poseBasis,
  );
  // Zooming in slides the aim from the frame's midpoint to the craft, so the close view is of the
  // craft and not of a point that, at a launch, lies inside the planet.
  const aim =
    craft !== undefined && offsets.zoom < 1
      ? lerpVec3(frame.aim, craft, 1 - offsets.zoom)
      : frame.aim;
  const exact = { target: aim, yaw, pitch, distance };
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

  // The eye never goes inside the framed planet (the Sun when the frame has none). A floored exact
  // pose writes its zoom back so further notches do not pile up below the floor.
  const planet = positionOf(frame.stop?.planetId ?? 'sun');
  const eye = eyeMpcOf({ ...shown, distance: 1 }, ctx.poseBasis);
  const floored =
    planet === undefined
      ? shown.distance
      : distanceOutsideSphere(
          shown.target,
          [eye[0] - shown.target[0], eye[1] - shown.target[1], eye[2] - shown.target[2]],
          shown.distance,
          planet,
          bodyRadiusMpc(frame.stop?.planetId ?? undefined) * MISSION_SURFACE_STANDOFF,
        );
  if (floored !== shown.distance) {
    if (from === null) offsets = { ...offsets, zoom: floored / frame.distance };
    shown = { ...shown, distance: floored };
  }

  return {
    pose: absoluteArm(shown),
    // The wheel only routes a notch to a row whose memory names its distance; `saturated`
    // false keeps the render loop awake through an ease on a paused clock.
    memory: {
      from: null,
      distanceTarget: shown.distance,
      panOffset: mem?.panOffset ?? [0, 0, 0],
      saturated: from === null,
      mission: {
        stops: mission.stops,
        stop: frame.stop,
        cruise: frame.cruise,
        from,
        easeAtMs,
        shortfall,
      },
    },
    actions: touched || viewChanged ? [setMissionOffsets(offsets)] : undefined,
  };
}
