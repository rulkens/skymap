import type { Vec3 } from '../../../../../src/@types/math/Vec3';

/**
 * panAxes — the orbit camera's screen-space right/up basis. A pan drag needs
 * to shift the target along "what the camera currently sees as sideways and
 * up," not a fixed world axis. `right` is the world Y axis crossed with the
 * eye-to-target direction (simplified: that direction only depends on
 * azimuth in the XZ plane); `up` is `right` crossed with the same eye
 * direction. Both fall out of `orbitEye`'s az/el parameterization, so they
 * stay orthonormal by construction, no runtime normalize needed.
 *
 * @param az Azimuth in radians, measured around the world Y axis.
 * @param el Elevation in radians, measured up from the XZ plane.
 * @returns The camera's right and up unit vectors in world space.
 */
export function panAxes(az: number, el: number): { readonly right: Vec3; readonly up: Vec3 } {
  const ce = Math.cos(az);
  const se = Math.sin(az);
  const cel = Math.cos(el);
  const sel = Math.sin(el);
  return {
    right: [se, 0, -ce],
    up: [-sel * ce, cel, -sel * se],
  };
}
