import type { EyeFrame } from '../../@types/camera/EyeFrame';
import type { Mat3 } from '../../@types/math/Mat3';
import type { Vec3 } from '../../@types/math/Vec3';
import { cross3 } from '../math/cross3';

/** The roll-free basis at `frame`'s standpoint with this azimuth and tilt. */
export function canonicalBasisAt(frame: EyeFrame, azimuthRad: number, tiltRad: number): Mat3 {
  const { localUp, east, north } = frame;
  const ch = Math.cos(azimuthRad);
  const sh = Math.sin(azimuthRad);
  const ct = Math.cos(tiltRad);
  const st = Math.sin(tiltRad);
  const horiz: Vec3 = [
    north[0] * ch + east[0] * sh,
    north[1] * ch + east[1] * sh,
    north[2] * ch + east[2] * sh,
  ];
  const forward: Vec3 = [
    horiz[0] * st - localUp[0] * ct,
    horiz[1] * st - localUp[1] * ct,
    horiz[2] * st - localUp[2] * ct,
  ];
  const up: Vec3 = [
    horiz[0] * ct + localUp[0] * st,
    horiz[1] * ct + localUp[1] * st,
    horiz[2] * ct + localUp[2] * st,
  ];
  const right = cross3(forward, up);
  return [
    right[0],
    right[1],
    right[2],
    up[0],
    up[1],
    up[2],
    forward[0],
    forward[1],
    forward[2],
  ] as Mat3;
}
