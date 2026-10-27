import type { BodyState } from '../../scene/BodyState';
import type { CelestialBody } from '../../scene/CelestialBody';
import type { BodyRelativePose } from '../camera/BodyRelativePose';

/** One body-slab-row derivation: the body, its state and the eye's pose in its frame. */
export type PreparedBodySurfaceFrame = {
  readonly body: CelestialBody;
  readonly bodyState: BodyState;
  readonly pose: BodyRelativePose;
  /** The DATUM radius tiles displace off; only the base globe shrinks to the
   *  inner bound (§7.4). */
  readonly radiusM: number;
};
