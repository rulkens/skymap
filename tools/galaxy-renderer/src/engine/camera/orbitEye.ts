/**
 * orbitEye — the orbit camera's eye position, extracted from the spike's
 * inline frame-loop computation in `galaxy-engine.js`.
 *
 * The orbit camera is authored as target + azimuth/elevation/distance
 * rather than as an eye position directly, because the thing a user drags
 * is "look around this galaxy," not "move this point in space." Orbiting
 * the eye around a fixed target keeps the subject centred under mouse
 * drag; orbiting the target around a fixed eye (the naive alternative)
 * would make the galaxy swim across the screen on every pan. The eye is
 * then just a point on a sphere of radius `dist` centred on `target`,
 * parameterized the usual way: azimuth sweeps around the world Y axis,
 * elevation tilts up out of the XZ plane.
 */
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

/**
 * Compute the eye position for an orbit camera looking at `target`.
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
