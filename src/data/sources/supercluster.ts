import type { StructureSourceEntry } from '../../@types/data/structure/StructureSourceEntry';
import { Source } from '../source';

export const SUPERCLUSTER_ENTRY = {
  type: 'structure',
  code: Source.Supercluster,
  id: 'supercluster',
  label: 'Supercluster',
  allSky: true,
  visible: true,
  bearsLabel: true,
  bearsMarker: true,
  labelLayer: 'structure',
  detailLabel: 'Supercluster',
  shortLabel: 'Supercluster',
  plural: 'Superclusters',
} as const satisfies StructureSourceEntry;
