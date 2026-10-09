import type { StructureSourceEntry } from '../../@types/data/structure/StructureSourceEntry';
import { Source } from '../source';

export const GLOBULAR_CLUSTER_ENTRY = {
  type: 'structure',
  code: Source.GlobularCluster,
  id: 'globular-cluster',
  label: 'Globular cluster',
  allSky: true,
  bearsLabel: true,
  bearsMarker: true,
  scale: 'milkyWay',
  labelLayer: 'structure',
  detailLabel: 'Globular Cluster',
  shortLabel: 'Globular cluster',
  plural: 'Globular clusters',
} as const satisfies StructureSourceEntry;
