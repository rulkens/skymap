import type { SatelliteSourceEntry } from '../../../@types/data/satellite/SatelliteSourceEntry';

export const SATELLITES_ENTRY = {
  type: 'satellite',
  id: 'satellites',
  label: 'Satellite',
  // Objects round Earth, not a sky patch: `allSky` matters only for galaxy-catalog footprints.
  allSky: true,
  bearsLabel: false,
  bearsMarker: false,
  detailLabel: 'Earth satellite',
  shortLabel: 'Satellite',
  plural: 'Satellites',
} as const satisfies SatelliteSourceEntry;
