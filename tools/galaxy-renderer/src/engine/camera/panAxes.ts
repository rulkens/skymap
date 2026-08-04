/**
 * panAxes — the orbit camera's screen-space right/up basis, extracted from
 * the spike's right/middle-drag handler in `galaxy-engine.js`.
 *
 * A pan drag needs to shift the orbit target along "what the camera
 * currently sees as sideways and up," not along a fixed world axis —
 * dragging right should always slide the view sideways from the current
 * vantage point, whatever azimuth/elevation the user has orbited to.
 * `right` is the world Y axis crossed with the eye-to-target direction
 * (simplified, since the eye direction only depends on azimuth in the XZ
 * plane); `up` is `right` crossed with that same eye direction, giving the
 * camera's actual up vector including elevation tilt. Both fall out of
 * `orbitEye`'s az/el parameterization, so they stay orthonormal by
 * construction rather than needing a runtime normalize.
 */
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

/**
 * Compute the orbit camera's right/up basis for a given azimuth/elevation.
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
