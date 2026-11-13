/**
 * overLonLatPose — the world camera straight over a lon/lat on `host`, `rangeM` above its datum,
 * looking at the body's centre with the heading held. Nadir-looking, so `toWorldArm`'s view axis
 * already passes through the centre: only the target (surface point → centre) and distance
 * change, and the roll carrying the heading survives the re-aim. `watchFlyToLonLatSaga` and a
 * far sky entry's approach both land here.
 */
import type { CameraPose } from '../../../../@types/camera/pose/CameraPose';
import type { LonLatDeg } from '../../../../@types/scene/LonLatDeg';
import type { Mat3 } from '../../../../@types/math/Mat3';
import type { HostBody } from '../arms/@types/HostBody';
import { toWorldArm } from '../arms/body/poseFrameConversion';
import { lonLatFocusPose } from '../../../../utils/camera/arms/lonLatFocusPose';
import { centreLookingArm } from '../../../../utils/camera/arms/centreLookingArm';
import { eyeMpcOf } from '../../../../utils/camera/orbitPose/eyeMpcOf';

export function overLonLatPose(
  point: LonLatDeg,
  host: HostBody,
  rangeM: number,
  headingRad: number,
  basis: Readonly<Mat3>,
): CameraPose {
  const surface = lonLatFocusPose(point, host.id, host.radiusM, rangeM, headingRad);
  const world = toWorldArm(
    surface,
    host.state,
    basis,
    basis,
    host.radiusM,
    host.standoffRadii,
    host.groundRadiusAtM,
  );
  return centreLookingArm(eyeMpcOf(world, basis), host.state.positionMpc, basis, world.roll ?? 0)
    .pose;
}
