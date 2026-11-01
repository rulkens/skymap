import type { Vec3 } from '../../math/Vec3';

/**
 * CompositeSample — the channels a `CompositeTrack` produces at one instant,
 * evaluated together. A field is present exactly when the track declares that
 * channel (`validateCompositeExclusivity` checks the two agree).
 */
export type CompositeSample = {
  readonly target?: Vec3;
  readonly distance?: number;
  readonly yaw?: number;
  readonly pitch?: number;
};
