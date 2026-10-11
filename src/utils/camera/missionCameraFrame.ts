/**
 * missionCameraFrame — the mission camera's geometry at `simDays` before the visitor's offsets:
 * aim at the mission frame's centre, look from outside the flyby's bend near a planet or along the
 * exhibit's cruise bearing far from one, stand back far enough that the frame's sphere fits. The view direction switches regime with hysteresis on the frame radius
 * (cruise above 0.5 AU, near again below 0.05 AU; `wasCruise` null on a first frame), so a radius
 * hovering at a threshold cannot flap it. Null when a body the frame needs has no position.
 */

import type { CameraMission } from '../../@types/camera/CameraMission';
import type { MissionCameraFrame } from '../../@types/camera/MissionCameraFrame';
import type { Mat3 } from '../../@types/math/Mat3';
import type { Vec3 } from '../../@types/math/Vec3';
import { SCALE_UNITS } from '../../data/scaleUnits';
import { ORIENTATION_FRAMES } from '../../data/orientation/orientationFrames';
import { flybyOutsideBend } from '../exhibits/mission/flybyOutsideBend';
import { missionFrame } from '../exhibits/mission/missionFrame';
import { cross3 } from '../math/cross3';
import { dot3 } from '../math/dot3';
import { normalize3 } from '../math/normalize3';
import { rotateVec3ByTightMat3 } from '../math/rotateVec3ByTightMat3';
import { orbitAnglesLookingAlong } from './orbitAnglesLookingAlong';
import { sphereFitDistance } from './sphereFitDistance';
import { yawPitchToDir } from './yawPitchToDir';

const NEAR_BELOW_MPC = 0.05 * SCALE_UNITS.AU_TO_MPC;
const CRUISE_ABOVE_MPC = 0.5 * SCALE_UNITS.AU_TO_MPC;
const ECLIPTIC = ORIENTATION_FRAMES.ecliptic;

export function missionCameraFrame(
  mission: CameraMission,
  simDays: number,
  positionOf: (id: string) => Readonly<Vec3> | undefined,
  fovYRad: number,
  aspect: number,
  poseBasis: Readonly<Mat3>,
  wasCruise: boolean | null,
): MissionCameraFrame | null {
  const frame = missionFrame(mission.stops, mission.craftId, simDays, positionOf);
  if (frame === null) return null;
  // `yawPitchToDir` points from the target toward the eye; the camera looks the other way.
  const back = rotateVec3ByTightMat3(
    yawPitchToDir(mission.cruise.yaw, mission.cruise.pitch),
    poseBasis,
  );
  const cruiseDir: Vec3 = [-back[0], -back[1], -back[2]];
  const cruise = frame.radiusMpc > (wasCruise ? NEAR_BELOW_MPC : CRUISE_ABOVE_MPC);
  // A flyby is seen from outside its bend at the cruise view's height above the planets' plane;
  // a stop without one (launch) keeps the cruise bearing.
  const outside = !cruise && frame.stop?.encounter && flybyOutsideBend(frame.stop.encounter);
  let viewDirection = cruiseDir;
  if (outside) {
    const { yaw } = orbitAnglesLookingAlong([-outside[0], -outside[1], -outside[2]], ECLIPTIC);
    const eyeward = rotateVec3ByTightMat3(yawPitchToDir(yaw, mission.cruise.pitch), ECLIPTIC);
    viewDirection = [-eyeward[0], -eyeward[1], -eyeward[2]];
  }
  // The orbit camera's own up, so the visitor's yaw turns about screen-up; its sideways axis
  // stands in where the viewDirection runs along up and the cross degenerates.
  const camUp: Vec3 = [poseBasis[3], poseBasis[4], poseBasis[5]];
  const camSide: Vec3 = [poseBasis[0], poseBasis[1], poseBasis[2]];
  const helper = Math.abs(dot3(viewDirection, camUp)) < 0.99 ? camUp : camSide;
  const right = normalize3(cross3(viewDirection, helper));
  const up = cross3(right, viewDirection);
  return {
    aim: frame.aim,
    viewDirection,
    right,
    up,
    distance: sphereFitDistance(frame.radiusMpc, fovYRad, aspect),
    stop: frame.stop,
    cruise,
  };
}
