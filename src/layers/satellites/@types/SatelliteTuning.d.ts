import type { SatelliteColors } from './SatelliteColors';

/** The satellites Layer's DebugPanel cluster: a tint per group, the light every dot gets, and the
 * dot's half-extent in px (the Gaussian is about that wide across). */
export type SatelliteTuning = {
  readonly colors: SatelliteColors;
  readonly ambient: number;
  readonly dotRadiusPx: number;
};
