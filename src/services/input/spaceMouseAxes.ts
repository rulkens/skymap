/**
 * spaceMouseAxes — runtime constants for the 6DOF SpaceMouse input shape.
 *
 * The `SpaceMouseAxes` type itself lives in `@types/input/SpaceMouseAxes`
 * (see that file for the coordinate-convention rationale).  Only the
 * runtime `ZERO_AXES` sentinel stays here, where the SpaceMouse pipeline
 * imports its other runtime helpers from.
 */

import type { SpaceMouseAxes } from '../../@types/input/SpaceMouseAxes';

/**
 * The "no input" axes vector — every channel zero.
 *
 * Useful as a default when the device is disconnected, or as a sentinel for
 * the engine to skip applying a frame's worth of input. Frozen so callers
 * can't accidentally mutate it (which would corrupt subsequent reads).
 */
export const ZERO_AXES: Readonly<SpaceMouseAxes> = Object.freeze({
  tx: 0,
  ty: 0,
  tz: 0,
  rx: 0,
  ry: 0,
  rz: 0,
});
