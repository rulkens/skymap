/**
 * host body arm → sky: the view read in the spot's ENU; the eye is dropped, the
 * tag fixes it. Looking up, the azimuth is read off −screen-up, which at
 * `canonicalBasisAt`'s tilt π is exactly the azimuth axis; past 45° it is the
 * longer horizontal part, mirroring `refAzimuthOf`'s nadir side.
 */

import type { BodyFixedPose } from '../../../../../../@types/camera/pose/BodyFixedPose';
import type { SkyPose } from '../../../../../../@types/camera/pose/SkyPose';
import type { SkySpot } from '../../../../../../@types/camera/pose/SkySpot';
import type { Vec3 } from '../../../../../../@types/math/Vec3';
import { dot3 } from '../../../../../../utils/math/dot3';
import { refAzimuthOf } from '../../../../../../utils/camera/surfaceFrame/refAzimuthOf';
import { siteEyeFrame } from '../../utils/siteEyeFrame';
import { skySpotRadial } from '../../../../../../utils/geo/skySpotRadial';

export function skyPoseFromBodyArm(arm: BodyFixedPose, spot: SkySpot): SkyPose {
  const { east, north, localUp } = siteEyeFrame(skySpotRadial(spot));
  const m = arm.basisLocal;
  const up: Vec3 = [m[3], m[4], m[5]];
  const forward: Vec3 = [m[6], m[7], m[8]];
  const sinAlt = dot3(forward, localUp);
  const azimuthRad =
    sinAlt > Math.SQRT1_2
      ? Math.atan2(-dot3(up, east), -dot3(up, north))
      : refAzimuthOf(localUp, forward, up, east, north);
  return { azimuthRad, altitudeRad: Math.asin(Math.min(1, Math.max(-1, sinAlt))) };
}
