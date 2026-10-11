import type { StructureSourceEntry } from '../../@types/data/structure/StructureSourceEntry';
import { Source } from '../source';

export const GC_CLUSTER_ENTRY = {
  type: 'structure',
  code: Source.GcCluster,
  id: 'gc-cluster',
  label: 'Galactic Centre',
  allSky: true,
  bearsLabel: true,
  bearsMarker: true,
  scale: 'milkyWay',
  labelLayer: 'structure',
  detailLabel: 'Galactic Centre',
  shortLabel: 'Galactic Centre',
  plural: 'Galactic Centre',
} as const satisfies StructureSourceEntry;
