import type { SatelliteColors } from '../../@types/SatelliteColors';
import type { SatelliteTuning } from '../../@types/SatelliteTuning';
import { SATELLITE_PROFILES } from '../../points/data/satelliteProfiles';

export const initialState: SatelliteTuning = {
  colors: Object.fromEntries(
    SATELLITE_PROFILES.map(({ id, color }) => [id, color]),
  ) as unknown as SatelliteColors,
  ambient: 0.04,
  dotRadiusPx: 2,
};
