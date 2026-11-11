import type { SatelliteColors } from './SatelliteColors';

/** The satellites Layer's DebugPanel cluster: a tint per group and the light every dot gets. */
export type SatelliteTuning = {
  readonly colors: SatelliteColors;
  readonly ambient: number;
};
