/**
 * SpaceMouseInputFactory — factory seam used by the SpaceMouse
 * subsystem.  Production omits this and the subsystem uses the real
 * `SpaceMouseInput` class; tests pass a stub factory so they can drive
 * `onAxes` / `onConnectionChange` directly without touching WebHID.
 */

import type { SpaceMouseInputCtorOptions } from './SpaceMouseInputCtorOptions';
import type { SpaceMouseInputLike } from './SpaceMouseInputLike';

export type SpaceMouseInputFactory = (options: SpaceMouseInputCtorOptions) => SpaceMouseInputLike;
