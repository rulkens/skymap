import type { SatelliteClass } from '../satellites/SatelliteClass';
import type { SatelliteClassSettings } from './SatelliteClassSettings';

/** SatellitesSettings — the Earth-satellite points: the section's master switch and one per class. */
export type SatellitesSettings = {
  enabled: boolean;
  items: Record<SatelliteClass, SatelliteClassSettings>;
};
