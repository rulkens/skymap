import type { ConstellationsSourceEntry } from '../../../@types/data/constellations/ConstellationsSourceEntry';

export const CONSTELLATIONS_ENTRY = {
  type: 'constellations',
  id: 'constellations',
  label: 'Constellations',
  allSky: true, // the classical 88-constellation set spans the whole sphere
  bearsLabel: false,
  bearsMarker: false,
} as const satisfies ConstellationsSourceEntry;
