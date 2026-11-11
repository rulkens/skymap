import type { StructureSourceEntry } from '../../../@types/data/structure/StructureSourceEntry';

export const NEBULA_ENTRY = {
  type: 'structure',
  id: 'nebula',
  label: 'Nebula',
  allSky: true,
  bearsLabel: true,
  bearsMarker: true,
  scale: 'milkyWay',
  detailLabel: 'Nebula',
  shortLabel: 'Nebula',
  plural: 'Nebulae',
} as const satisfies StructureSourceEntry;
