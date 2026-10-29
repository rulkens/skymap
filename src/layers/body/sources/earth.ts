import type { BodySourceEntry } from '../../../@types/data/body/BodySourceEntry';
import { Source } from '../../../data/source';

export const EARTH_ENTRY = {
  type: 'body',
  code: Source.Earth,
  id: 'earth',
  label: 'Earth',
  // Only galaxy-catalog footprints consult this flag; true matches the other non-catalog rows.
  allSky: true,
  bearsLabel: true,
  bearsMarker: false,
  detailLabel: 'Earth',
  shortLabel: 'Earth',
  // The singular spelling is deliberate: the panel row for the one Earth reads "Earth".
  plural: 'Earth',
} as const satisfies BodySourceEntry;
