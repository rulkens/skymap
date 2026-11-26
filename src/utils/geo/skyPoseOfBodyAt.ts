/**
 * skyPoseOfBodyAt — where a body stands in a ground spot's sky at `simDays`, as
 * the `{ sky }` arm's yaw/pitch: azimuth from north through east, altitude above
 * the horizon. Seen from the host's centre, so the Moon is off by up to ~1° of
 * parallax; the Sun and the planets are not.
 */

import type { SkyPose } from '../../@types/camera/pose/SkyPose';
import type { SkySpot } from '../../@types/camera/pose/SkySpot';
import type { Vec3 } from '../../@types/math/Vec3';
import { orientationForBody } from '../../data/bodies/orientationForBody';
import { siteEyeFrame } from '../../services/engine/camera/arms/utils/siteEyeFrame';
import { bodyPositionMpcAt } from '../exhibits/mission/bodyPositionMpcAt';
import { dot3 } from '../math/dot3';
import { normalize3 } from '../math/normalize3';
import { rotateByTranspose } from '../math/rotateByTranspose';
import { skySpotRadial } from './skySpotRadial';

export function skyPoseOfBodyAt(bodyId: string, spot: SkySpot, simDays: number): SkyPose {
  const host = bodyPositionMpcAt(spot.body, simDays);
  const body = bodyPositionMpcAt(bodyId, simDays);
  const toBodyWorld: Vec3 = [body[0] - host[0], body[1] - host[1], body[2] - host[2]];
  const hostFixed = orientationForBody(spot.body, simDays, new Map());
  const toBody = normalize3(rotateByTranspose(hostFixed, toBodyWorld));
  const { east, north, localUp } = siteEyeFrame(skySpotRadial(spot));
  return {
    azimuthRad: Math.atan2(dot3(toBody, east), dot3(toBody, north)),
    altitudeRad: Math.asin(dot3(toBody, localUp)),
  };
}
