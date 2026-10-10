import type { StructureSourceEntry } from '../../@types/data/structure/StructureSourceEntry';
import { Source } from '../source';

export const OPEN_CLUSTER_ENTRY = {
  type: 'structure',
  code: Source.OpenCluster,
  id: 'open-cluster',
  label: 'Open cluster',
  allSky: true,
  bearsLabel: true,
  bearsMarker: true,
  scale: 'milkyWay',
  labelLayer: 'structure',
  detailLabel: 'Open Cluster',
  shortLabel: 'Open cluster',
  plural: 'Open clusters',
} as const satisfies StructureSourceEntry;
