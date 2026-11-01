import type { SatelliteClass } from '../../@types/satellites/SatelliteClass';

/** How each class reads in the Settings section. */
export const SATELLITE_CLASS_LABELS: Readonly<Record<SatelliteClass, string>> = {
  active: 'Active satellites',
  debris: 'Debris',
  other: 'Other tracked objects',
};
