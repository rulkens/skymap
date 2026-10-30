import type { BodySourceEntry } from '../../../@types/data/body/BodySourceEntry';
import { Source } from '../../../data/source';

export const SMALL_BODY_ENTRY = {
  type: 'body',
  code: Source.SmallBody,
  id: 'small-body',
  label: 'Small body',
  // Only galaxy-catalog footprints consult this flag; true matches the other non-catalog rows.
  allSky: true,
  // A label-only row: Vesta, Ceres and Bennu caption under it but pick as `Planet` rows.
  bearsLabel: true,
  bearsMarker: false,
  detailLabel: 'Small body',
  shortLabel: 'Small body',
  plural: 'Small bodies',
} as const satisfies BodySourceEntry;
