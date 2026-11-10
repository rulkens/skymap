import type { StructureSourceEntry } from '../../../@types/data/structure/StructureSourceEntry';

export const OPEN_CLUSTER_ENTRY = {
  type: 'structure',
  id: 'open-cluster',
  label: 'Open cluster',
  allSky: true,
  bearsLabel: true,
  bearsMarker: true,
  scale: 'milkyWay',
  detailLabel: 'Open Cluster',
  shortLabel: 'Open cluster',
  plural: 'Open clusters',
} as const satisfies StructureSourceEntry;
