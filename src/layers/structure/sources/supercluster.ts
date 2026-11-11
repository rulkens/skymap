import type { StructureSourceEntry } from '../../../@types/data/structure/StructureSourceEntry';

export const SUPERCLUSTER_ENTRY = {
  type: 'structure',
  id: 'supercluster',
  label: 'Supercluster',
  allSky: true,
  bearsLabel: true,
  bearsMarker: true,
  scale: 'cosmic',
  detailLabel: 'Supercluster',
  shortLabel: 'Supercluster',
  plural: 'Superclusters',
} as const satisfies StructureSourceEntry;
