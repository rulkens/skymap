import type { StructureSourceEntry } from '../../@types/data/structure/StructureSourceEntry';
import { Source } from '../source';

export const GALAXY_CLUSTER_ENTRY = {
  type: 'structure',
  code: Source.GalaxyCluster,
  id: 'galaxy-cluster',
  label: 'Galaxy cluster',
  allSky: true,
  bearsLabel: true,
  bearsMarker: true,
  scale: 'cosmic',
  labelLayer: 'structure',
  detailLabel: 'Galaxy Cluster',
  shortLabel: 'Galaxy cluster',
  plural: 'Galaxy clusters',
} as const satisfies StructureSourceEntry;
