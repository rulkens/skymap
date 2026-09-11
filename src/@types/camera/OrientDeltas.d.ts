import type { OrientDofDelta } from './OrientDofDelta';

/** Per-DOF pose motion, keyed the same as `CameraDofAngles`' rows. */
export type OrientDeltas = {
  readonly heading: OrientDofDelta;
  readonly tilt: OrientDofDelta;
  readonly roll: OrientDofDelta;
};
