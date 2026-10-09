/**
 * missionNormal — the direction the mission camera looks along: the flyby-plane normal near a
 * planet (the side view of the bend), the exhibit's cruise bearing far from one, blended on the
 * frame radius in log space between 0.05 and 0.5 AU. Near a planet the two stops' normals blend
 * by the frame's own hand-off weight; a stop without a flyby (launch) contributes the cruise.
 */

import type { MissionFrame } from '../../../@types/missions/MissionFrame';
import type { MissionStop } from '../../../@types/missions/MissionStop';
import type { Vec3 } from '../../../@types/math/Vec3';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { lerpVec3 } from '../../math/lerpVec3';
import { smoothstep } from '../../math/smoothstep';
import { flybyNormal } from './flybyNormal';

const NEAR_LOG_MPC = Math.log(0.05 * SCALE_UNITS.AU_TO_MPC);
const CRUISE_LOG_MPC = Math.log(0.5 * SCALE_UNITS.AU_TO_MPC);

function stopNormal(stop: MissionStop | null, cruise: Readonly<Vec3>): Readonly<Vec3> {
  return (stop?.encounter && flybyNormal(stop.encounter)) || cruise;
}

export function missionNormal(frame: MissionFrame, cruise: Readonly<Vec3>): Vec3 {
  const ahead = stopNormal(frame.ahead, cruise);
  const near = frame.behind
    ? lerpVec3(stopNormal(frame.behind, cruise), ahead, frame.weight)
    : ahead;
  const s = smoothstep(NEAR_LOG_MPC, CRUISE_LOG_MPC, Math.log(frame.radiusMpc));
  const dir = lerpVec3(near, cruise, s);
  const len = Math.hypot(dir[0], dir[1], dir[2]);
  // Two opposed normals mid-hand-off cancel; the cruise bearing is the only defined view then.
  return len < 1e-6
    ? [cruise[0], cruise[1], cruise[2]]
    : [dir[0] / len, dir[1] / len, dir[2] / len];
}
