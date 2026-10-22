import type { BodyState } from '../../scene/BodyState';
import type { CelestialBody } from '../../scene/CelestialBody';
import type { BodyRelativePose } from '../camera/BodyRelativePose';
import type { Vec3 } from '../../math/Vec3';

/** One body-slab-row derivation: the body's frame, pose and body-local camera maths. */
export type PreparedBodySurfaceFrame = {
  readonly body: CelestialBody;
  readonly bodyState: BodyState;
  readonly pose: BodyRelativePose;
  readonly radiusM: number;
  /** composeBodySlabMvp result — RAW f64; the tile planner needs it un-narrowed. */
  readonly mvpLocal: Float64Array;
  /** bodySlabCamLocal result — dimensionless body-radius units. */
  readonly camLocal: Vec3;
};
