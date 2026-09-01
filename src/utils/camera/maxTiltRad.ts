import { SURFACE_REGIME } from '../../data/camera/surfaceRegime';
import { smoothstep } from '../math/smoothstep';

/** The look-mode tilt ceiling, ramping from full at the ground to closed at disengage. */
export function maxTiltRad(hOverR: number): number {
  // edge0 > edge1 here is deliberate, not a transposed-argument bug: the
  // ceiling opens as h/R falls, so the ramp runs descending.
  return (
    SURFACE_REGIME.tiltMaxRad *
    smoothstep(SURFACE_REGIME.disengageHR, SURFACE_REGIME.tiltFullHR, hOverR)
  );
}
