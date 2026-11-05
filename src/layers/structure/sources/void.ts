import type { StructureSourceEntry } from '../../../@types/data/structure/StructureSourceEntry';
import { Source } from '../../../data/source';

export const VOID_ENTRY = {
  type: 'structure',
  code: Source.Void,
  id: 'void',
  label: 'Void',
  allSky: true,
  bearsLabel: true,
  bearsMarker: true,
  scale: 'cosmic',
  detailLabel: 'Cosmic Void',
  shortLabel: 'Void',
  plural: 'Voids',
} as const satisfies StructureSourceEntry;
