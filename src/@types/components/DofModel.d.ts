/**
 * DofModel — one CameraStateSection row: a DOF's raw current/target/residual
 * plus its polled delta, tagged with whether north-up is currently applying it.
 */
import type { CameraDofRow } from '../camera/CameraDofRow';
import type { OrientDofDelta } from '../camera/OrientDofDelta';

export type DofModel = {
  readonly name: string;
  /** North-up unchecked: the target is still a field property, nothing applies it. */
  readonly off: boolean;
  readonly row: CameraDofRow;
  readonly delta: OrientDofDelta;
};
