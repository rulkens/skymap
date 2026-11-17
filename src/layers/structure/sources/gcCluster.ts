import type { StructureSourceEntry } from '../../../@types/data/structure/StructureSourceEntry';

export const GC_CLUSTER_ENTRY = {
  type: 'structure',
  id: 'gc-cluster',
  label: 'Galactic Centre',
  allSky: true,
  bearsLabel: true,
  bearsMarker: true,
  scale: 'milkyWay',
  detailLabel: 'Galactic Centre',
  shortLabel: 'Galactic Centre',
  plural: 'Galactic Centre',
} as const satisfies StructureSourceEntry;
