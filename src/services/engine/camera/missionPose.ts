/**
 * missionPose — the mission driver's pose: the mission frame at this frame's instant, looked at
 * along its normal turned by the visitor's offsets. Evaluated exactly every frame, with no lag,
 * so the craft never trails out of view (but for the ease after a step or craft switch). Offsets are read back from where a released drag or a
 * swallowed wheel notch left the camera (the follow rows' trick), so the visitor orbits and zooms
 * INSIDE the frame and a step resets them. Yaw and pitch come from `orbitAnglesLookingAlong` in
 * the committed basis; an inverse written here would drift under a non-equatorial orientation.
 */

import type { BodyId } from '../../../@types/data/body/BodyId';
import type { DriverCtx } from '../../../@types/engine/camera/DriverCtx';
import type { FollowMemory } from '../../../@types/engine/camera/FollowMemory';
import type { FramedCameraPose } from '../../../@types/camera/FramedCameraPose';
import type { MissionOffsets } from '../../../@types/camera/MissionOffsets';
import { setMissionOffsets } from '../../../state/camera/cameraSlice';
import { absoluteArm } from '../../../utils/camera/absoluteArm';
import { eyeMpcOf } from '../../../utils/camera/eyeMpcOf';
import { orbitAnglesLookingAlong } from '../../../utils/camera/orbitAnglesLookingAlong';
import { missionCameraFrame } from '../../../utils/camera/missionCameraFrame';
import { missionOffsetsOfView } from '../../../utils/camera/missionOffsetsOfView';
import { missionViewDirection } from '../../../utils/camera/missionViewDirection';
import { MISSION_EASE_MS } from '../../../data/exhibits/mission/missionEaseMs';
import { blendCameraPose } from '../../../utils/camera/blendCameraPose';
import { easeOutCubic } from '../../../utils/math/easeOutCubic';
import { normalize3 } from '../../../utils/math/normalize3';

export function missionPose(
  ctx: DriverCtx,
  mem: FollowMemory | null,
): {
  readonly pose: FramedCameraPose;
  readonly memory: FollowMemory | null;
  readonly actions?: readonly ReturnType<typeof setMissionOffsets>[];
} {
  const mission = ctx.state.camera.mission;
  const { fovYRad, aspect } = ctx.projection;
  const frame =
    mission === null
      ? null
      : missionCameraFrame(
          mission,
          ctx.simDays,
          (id) => ctx.bodies.get(id as BodyId)?.positionMpc,
          fovYRad,
          aspect,
          ctx.poseBasis,
        );
  if (mission === null || frame === null) return { pose: ctx.state.camera.base, memory: mem };

  let offsets: MissionOffsets = mission.offsets;
  if (ctx.winnerLastFrame === 'orbitDrag') {
    // The drag edge committed the dragged register; its view and distance ARE the new offsets.
    const w = ctx.committedWorld;
    const eye = eyeMpcOf(w, ctx.poseBasis);
    const view = normalize3([w.target[0] - eye[0], w.target[1] - eye[1], w.target[2] - eye[2]]);
    offsets = missionOffsetsOfView(frame, view, w.distance);
  } else if (ctx.followDistanceTarget !== null) {
    offsets = { ...offsets, zoom: ctx.followDistanceTarget / frame.distance };
  }

  const distance = frame.distance * offsets.zoom;
  const { yaw, pitch } = orbitAnglesLookingAlong(
    missionViewDirection(frame, offsets),
    ctx.poseBasis,
  );
  const exact = { target: frame.aim, yaw, pitch, distance };
  // A step or craft switch bumps `retarget`; the epoch then restarts and the first frame of it
  // (elapsed 0) captures where the camera was, so the ease starts from what the visitor saw.
  const easing = mission.retarget > 0 && ctx.elapsedMs < MISSION_EASE_MS;
  const from = !easing ? null : ctx.elapsedMs === 0 || !mem?.from ? ctx.authoredWorld : mem.from;
  const shown =
    from === null
      ? exact
      : blendCameraPose(from, exact, easeOutCubic(ctx.elapsedMs / MISSION_EASE_MS));
  return {
    pose: absoluteArm(shown),
    // The wheel only routes a notch to a row whose memory names its distance.
    memory: {
      from,
      distanceTarget: distance,
      panOffset: mem?.panOffset ?? [0, 0, 0],
      saturated: true,
    },
    actions: offsets === mission.offsets ? undefined : [setMissionOffsets(offsets)],
  };
}
