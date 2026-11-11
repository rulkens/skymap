import type { StructureSourceEntry } from '../../../@types/data/structure/StructureSourceEntry';

export const GALAXY_CLUSTER_ENTRY = {
  type: 'structure',
  id: 'galaxy-cluster',
  label: 'Galaxy cluster',
  allSky: true,
  bearsLabel: true,
  bearsMarker: true,
  scale: 'cosmic',
  detailLabel: 'Galaxy Cluster',
  shortLabel: 'Galaxy cluster',
  plural: 'Galaxy clusters',
} as const satisfies StructureSourceEntry;
