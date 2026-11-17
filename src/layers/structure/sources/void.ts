import type { StructureSourceEntry } from '../../../@types/data/structure/StructureSourceEntry';

export const VOID_ENTRY = {
  type: 'structure',
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
