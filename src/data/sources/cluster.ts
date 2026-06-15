import type { StructureSourceEntry } from '../../@types/data/StructureSourceEntry';
import { Source } from '../source';

export const CLUSTER_ENTRY = {
  type: 'structure',
  code: Source.Cluster,
  id: 'cluster',
  label: 'Cluster',
  allSky: true,
  visible: true,
  bearsLabel: true,
  bearsMarker: true,
  labelLayer: 'structure',
  detailLabel: 'Galaxy Cluster',
  shortLabel: 'Cluster',
  plural: 'Clusters',
} as const satisfies StructureSourceEntry;
