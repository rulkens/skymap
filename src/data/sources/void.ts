import type { StructureSourceEntry } from '../../@types/data/StructureSourceEntry';
import { Source } from '../source';

export const VOID_ENTRY = {
  type: 'structure',
  code: Source.Void,
  id: 'void',
  label: 'Void',
  allSky: true,
  visible: true,
  bearsLabel: true,
  bearsMarker: true,
  labelLayer: 'structure',
  detailLabel: 'Cosmic Void',
  shortLabel: 'Void',
  plural: 'Voids',
} as const satisfies StructureSourceEntry;
