/**
 * ridePose — the ride driver's pose: aim between craft and target, look along the encounter
 * normal turned by the visitor's offsets. Offsets are read back from where a released drag or a
 * swallowed wheel notch left the camera (the follow rows' trick), so the visitor orbits and zooms
 * INSIDE the ride frame and a re-step resets them. Yaw and pitch come from
 * `orbitAnglesLookingAlong` in the committed basis; an inverse written here would drift
 * under a non-equatorial orientation.
 */

import type { BodyId } from '../../../@types/data/body/BodyId';
import type { DriverCtx } from '../../../@types/engine/camera/DriverCtx';
import type { FollowMemory } from '../../../@types/engine/camera/FollowMemory';
import type { FramedCameraPose } from '../../../@types/camera/FramedCameraPose';
import type { RideOffsets } from '../../../@types/camera/RideOffsets';
import { setRideOffsets } from '../../../state/camera/cameraSlice';
import { absoluteArm } from '../../../utils/camera/absoluteArm';
import { eyeMpcOf } from '../../../utils/camera/eyeMpcOf';
import { orbitAnglesLookingAlong } from '../../../utils/camera/orbitAnglesLookingAlong';
import { rideFrame } from '../../../utils/camera/rideFrame';
import { rideOffsetsOfView } from '../../../utils/camera/rideOffsetsOfView';
import { rideViewDirection } from '../../../utils/camera/rideViewDirection';
import { normalize3 } from '../../../utils/math/normalize3';

export function ridePose(
  ctx: DriverCtx,
  mem: FollowMemory | null,
): {
  readonly pose: FramedCameraPose;
  readonly memory: FollowMemory | null;
  readonly actions?: readonly ReturnType<typeof setRideOffsets>[];
} {
  const ride = ctx.state.camera.ride;
  const craft = ride === null ? undefined : ctx.bodies.get(ride.craftId as BodyId);
  const target = ride === null ? undefined : ctx.bodies.get(ride.targetId as BodyId);
  if (ride === null || craft === undefined || target === undefined) {
    return { pose: ctx.state.camera.base, memory: mem };
  }
  const { fovYRad, aspect } = ctx.projection;
  const frame = rideFrame(
    ride,
    craft.positionMpc,
    target.positionMpc,
    fovYRad,
    aspect,
    ctx.poseBasis,
  );

  let offsets: RideOffsets = ride.offsets;
  if (ctx.winnerLastFrame === 'orbitDrag') {
    // The drag edge committed the dragged register; its view and distance ARE the new offsets.
    const w = ctx.committedWorld;
    const eye = eyeMpcOf(w, ctx.poseBasis);
    const view = normalize3([w.target[0] - eye[0], w.target[1] - eye[1], w.target[2] - eye[2]]);
    offsets = rideOffsetsOfView(frame, view, w.distance);
  } else if (ctx.followDistanceTarget !== null) {
    offsets = { ...offsets, zoom: ctx.followDistanceTarget / frame.distance };
  }

  const distance = frame.distance * offsets.zoom;
  const { yaw, pitch } = orbitAnglesLookingAlong(rideViewDirection(frame, offsets), ctx.poseBasis);
  return {
    pose: absoluteArm({ target: frame.aim, yaw, pitch, distance }),
    // The wheel only routes a notch to a row whose memory names its distance.
    memory: {
      from: null,
      distanceTarget: distance,
      panOffset: mem?.panOffset ?? [0, 0, 0],
      saturated: true,
    },
    actions: offsets === ride.offsets ? undefined : [setRideOffsets(offsets)],
  };
}
