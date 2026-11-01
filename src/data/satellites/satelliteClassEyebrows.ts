import type { SatelliteClass } from '../../@types/satellites/SatelliteClass';

/** The one-word kind a satellite's card names above its title. */
export const SATELLITE_CLASS_EYEBROWS: Readonly<Record<SatelliteClass, string>> = {
  active: 'Satellite',
  debris: 'Debris',
  other: 'Tracked object',
};
