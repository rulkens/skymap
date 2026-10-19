/**
 * voyagePose — the voyage driver's pose: the eye on the ship, looking along the line of flight
 * turned by the visitor's offsets, its target `VOYAGE_EYE_ARM_MPC` ahead so a drag turns the view
 * about the eye. Past arrival at a galaxy the view orbits it instead, at the fit of its
 * destination's `arrivalRadiusMpc` sphere. A view change (a re-aim, or arriving) eases from the pose
 * last shown over `MISSION_EASE_MS` of wall time on the aim epoch, as `missionPose` does; a re-aim
 * drops the offsets. The drag's view is read off the pose's angles, never as target − eye: 100 au
 * apart at 17 Mpc, that subtraction would lose five digits.
 */

import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { MissionCameraFrame } from '../../../@types/camera/MissionCameraFrame';
import type { MissionOffsets } from '../../../@types/camera/MissionOffsets';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { DriverCtx } from '../../../@types/engine/camera/DriverCtx';
import type { DriverOutput } from '../../../@types/engine/camera/DriverOutput';
import type { FollowMemory } from '../../../@types/engine/camera/FollowMemory';
import type { VoyageCameraMemory } from '../@types/VoyageCameraMemory';
import type { VoyageSection } from '../@types/VoyageSection';
import { MISSION_EASE_MS } from '../../../data/exhibits/mission/missionEaseMs';
import { NO_MISSION_OFFSETS } from '../../../data/exhibits/mission/noMissionOffsets';
import { VOYAGE_DESTINATIONS } from '../../../data/voyage/voyageDestinations';
import { VOYAGE_EYE_ARM_MPC } from '../../../data/voyage/voyageEyeArmMpc';
import { absoluteArm } from '../../../utils/camera/absoluteArm';
import { blendCameraPose } from '../../../utils/camera/blendCameraPose';
import { missionOffsetsOfView } from '../../../utils/camera/missionOffsetsOfView';
import { missionViewDirection } from '../../../utils/camera/missionViewDirection';
import { orbitAnglesLookingAlong } from '../../../utils/camera/orbitAnglesLookingAlong';
import { sphereFitDistance } from '../../../utils/camera/sphereFitDistance';
import { yawPitchToDir } from '../../../utils/camera/yawPitchToDir';
import { cross3 } from '../../../utils/math/cross3';
import { dot3 } from '../../../utils/math/dot3';
import { normalize3 } from '../../../utils/math/normalize3';
import { rotateVec3ByTightMat3 } from '../../../utils/math/rotateVec3ByTightMat3';
import { smoothstep } from '../../../utils/math/smoothstep';
import { voyageFrameBoost } from '../../../utils/voyage/voyageFrameBoost';
import { voyageShipState } from '../../../utils/voyage/voyageShipState';

export function voyagePose(
  ctx: DriverCtx,
  mem: FollowMemory | null,
  own: VoyageCameraMemory | null,
  _data: VoyageSection,
): DriverOutput<VoyageCameraMemory> {
  const voyage = ctx.state.settings.voyage;
  const boost = voyageFrameBoost(voyage, ctx.simDays);
  if (boost === null) return { pose: ctx.state.camera.base, memory: mem };
  const { arrivalRadiusMpc } = VOYAGE_DESTINATIONS[voyage.destination!];
  const arrived =
    arrivalRadiusMpc !== null && voyageShipState(voyage, ctx.simDays)!.phase === 'arrived';
  const token = ctx.state.camera.aim;
  const now = ctx.elapsedMs;
  const basis = ctx.poseBasis;
  const sameAim = own !== null && own.aim === token;
  const prev = sameAim ? own.view : null;

  // Riding, the eye is the fixed point (aim = the ship); arrived, the galaxy is what it orbits.
  const camUp: Vec3 = [basis[3], basis[4], basis[5]];
  const camSide: Vec3 = [basis[0], basis[1], basis[2]];
  const helper = Math.abs(dot3(boost.dir, camUp)) < 0.99 ? camUp : camSide;
  const right = normalize3(cross3(boost.dir, helper));
  const frame: MissionCameraFrame = {
    aim: arrived ? [...VOYAGE_DESTINATIONS[voyage.destination!].positionMpc] : [...boost.shipMpc],
    viewDirection: [...boost.dir],
    right,
    up: cross3(right, boost.dir),
    distance: arrived
      ? sphereFitDistance(arrivalRadiusMpc, ctx.projection.fovYRad, ctx.projection.aspect)
      : VOYAGE_EYE_ARM_MPC,
    stop: null,
    cruise: !arrived,
  };

  const viewChanged = prev !== null && prev.arrived !== arrived;
  let offsets: MissionOffsets = sameAim && !viewChanged ? own.offsets : NO_MISSION_OFFSETS;
  if (ctx.state.camera.dragging) {
    // The drag rung stepped last frame's pose; its view and distance ARE the new offsets.
    const w = ctx.authoredWorld;
    const back = rotateVec3ByTightMat3(yawPitchToDir(w.yaw, w.pitch), basis);
    offsets = missionOffsetsOfView(frame, [-back[0], -back[1], -back[2]], w.distance);
  } else if (ctx.followDistanceTarget !== null) {
    offsets = { ...offsets, zoom: ctx.followDistanceTarget / frame.distance };
  }

  let from = prev?.from ?? null;
  let easeAtMs = prev?.easeAtMs ?? now;
  const easing = from !== null && now - easeAtMs < MISSION_EASE_MS;
  if (prev === null ? (token?.ease ?? false) : viewChanged) {
    from = ctx.authoredWorld;
    easeAtMs = now;
  } else if (!easing) from = null;

  const view = missionViewDirection(frame, offsets);
  const distance = frame.distance * offsets.zoom;
  const target: Vec3 = arrived
    ? frame.aim
    : [
        frame.aim[0] + view[0] * distance,
        frame.aim[1] + view[1] * distance,
        frame.aim[2] + view[2] * distance,
      ];
  const exact: CameraPose = { target, ...orbitAnglesLookingAlong(view, basis), distance };
  const shown =
    from === null
      ? exact
      : blendCameraPose(from, exact, smoothstep(0, MISSION_EASE_MS, now - easeAtMs));

  return {
    pose: absoluteArm(shown),
    // `saturated` false keeps the render loop awake through an ease on a paused clock.
    memory: {
      from: null,
      distanceTarget: shown.distance,
      panOffset: mem?.panOffset ?? [0, 0, 0],
      saturated: from === null,
    },
    own: { aim: token, offsets, view: { arrived, from, easeAtMs } },
  };
}
