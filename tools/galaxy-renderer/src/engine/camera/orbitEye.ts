import type { Vec3 } from '../../../../../src/@types/math/Vec3';

/**
 * orbitEye — the orbit camera's eye position: a point on a sphere of radius
 * `dist` centred on `target`, azimuth sweeping around the world Y axis,
 * elevation tilting up out of the XZ plane. Authored as target +
 * azimuth/elevation/distance rather than an eye position directly, because
 * orbiting the eye around a fixed target keeps the subject centred under
 * drag — orbiting the target around a fixed eye would make the galaxy swim
 * across the screen on every pan.
 *
 * @param az     Azimuth in radians, measured around the world Y axis.
 * @param el     Elevation in radians, measured up from the XZ plane.
 * @param dist   Distance from `target` to the eye.
 * @param target The point the camera orbits.
 * @returns The eye position in world space.
 */
export function orbitEye(az: number, el: number, dist: number, target: Readonly<Vec3>): Vec3 {
  const ce = Math.cos(el);
  const se = Math.sin(el);
  return [
    target[0] + dist * ce * Math.cos(az),
    target[1] + dist * se,
    target[2] + dist * ce * Math.sin(az),
  ];
}
