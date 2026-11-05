import type { ConstellationsSourceEntry } from '../../../@types/data/constellations/ConstellationsSourceEntry';
import { Source } from '../../../data/source';

export const CONSTELLATIONS_ENTRY = {
  type: 'constellations',
  code: Source.Constellations,
  id: 'constellations',
  label: 'Constellations',
  allSky: true, // the classical 88-constellation set spans the whole sphere
  bearsLabel: false,
  bearsMarker: false,
} as const satisfies ConstellationsSourceEntry;
