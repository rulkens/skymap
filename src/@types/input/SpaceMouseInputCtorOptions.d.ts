/**
 * SpaceMouseInputCtorOptions — option bag the SpaceMouse subsystem
 * passes through to whichever factory builds the underlying
 * SpaceMouseInputLike.  Same shape as `SpaceMouseInputOptions` but
 * named separately because the subsystem treats this as the contract
 * with the factory seam, not directly with `SpaceMouseInput`.
 */

import type { SpaceMouseAxes } from './SpaceMouseAxes';

export type SpaceMouseInputCtorOptions = {
  onAxes: (axes: SpaceMouseAxes) => void;
  onConnectionChange?: (connected: boolean, productName: string | null) => void;
};
