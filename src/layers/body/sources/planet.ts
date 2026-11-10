import type { BodySourceEntry } from '../../../@types/data/body/BodySourceEntry';

export const PLANET_ENTRY = {
  type: 'body',
  id: 'planet',
  label: 'Planet',
  // Only galaxy-catalog footprints consult this flag; true matches the other non-catalog rows.
  allSky: true,
  // The Moon rides this row's 'planet' caption kind, so it follows the same gate.
  bearsLabel: true,
  bearsMarker: false,
  detailLabel: 'Planet',
  shortLabel: 'Planet',
  plural: 'Planets',
} as const satisfies BodySourceEntry;
