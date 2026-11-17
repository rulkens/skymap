import type { StructureSourceEntry } from '../../../@types/data/structure/StructureSourceEntry';

export const GLOBULAR_CLUSTER_ENTRY = {
  type: 'structure',
  id: 'globular-cluster',
  label: 'Globular cluster',
  allSky: true,
  bearsLabel: true,
  bearsMarker: true,
  scale: 'milkyWay',
  detailLabel: 'Globular Cluster',
  shortLabel: 'Globular cluster',
  plural: 'Globular clusters',
} as const satisfies StructureSourceEntry;
