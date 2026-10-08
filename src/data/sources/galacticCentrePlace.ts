import type { StructureSourceEntry } from '../../@types/data/structure/StructureSourceEntry';
import { Source } from '../source';

export const GALACTIC_CENTRE_PLACE_ENTRY = {
  type: 'structure',
  code: Source.GalacticCentrePlace,
  id: 'galactic-centre',
  label: 'Galactic Centre place',
  allSky: true,
  bearsLabel: true,
  bearsMarker: true,
  scale: 'milkyWay',
  labelLayer: 'structure',
  detailLabel: 'Galactic Centre Place',
  shortLabel: 'Galactic Centre',
  plural: 'Galactic Centre',
} as const satisfies StructureSourceEntry;
