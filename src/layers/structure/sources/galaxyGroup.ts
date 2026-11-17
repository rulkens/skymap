import type { StructureSourceEntry } from '../../../@types/data/structure/StructureSourceEntry';

export const GALAXY_GROUP_ENTRY = {
  type: 'structure',
  id: 'galaxy-group',
  label: 'Galaxy group',
  allSky: true,
  bearsLabel: true,
  bearsMarker: true,
  scale: 'cosmic',
  detailLabel: 'Galaxy Group',
  shortLabel: 'Galaxy group',
  plural: 'Galaxy groups',
} as const satisfies StructureSourceEntry;
