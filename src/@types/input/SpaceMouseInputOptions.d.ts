/**
 * Constructor options for `SpaceMouseInput`.
 *
 * `onAxes` is called every time we successfully decode a report — typically
 * 60–100 Hz when the puck is deflected, never when it's at rest (the
 * firmware suppresses zero reports).
 *
 * The callback receives a fresh axes object each call; the implementation
 * may safely retain or mutate it.
 */

import type { SpaceMouseAxes } from './SpaceMouseAxes';

export type SpaceMouseInputOptions = {
  /** Called on every decoded report with the latest axes reading. */
  onAxes: (axes: SpaceMouseAxes) => void;
  /**
   * Optional callback fired when the device's connect/disconnect state
   * changes (paired, unpaired, USB unplug, etc.). Useful for the settings
   * panel's "Connected: <product>" status text.
   */
  onConnectionChange?: (connected: boolean, productName: string | null) => void;
};
