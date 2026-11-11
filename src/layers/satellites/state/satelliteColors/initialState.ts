import type { SatelliteColors } from '../../@types/SatelliteColors';
import { SATELLITE_PROFILES } from '../../points/data/satelliteProfiles';

export const initialState = Object.fromEntries(
  SATELLITE_PROFILES.map(({ id, color }) => [id, color]),
) as unknown as SatelliteColors;
