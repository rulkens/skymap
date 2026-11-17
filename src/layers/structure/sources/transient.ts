import type { StructureSourceEntry } from '../../../@types/data/structure/StructureSourceEntry';

export const TRANSIENT_ENTRY = {
  type: 'structure',
  id: 'transient',
  label: 'Transient',
  allSky: true,
  bearsLabel: true,
  bearsMarker: true,
  pointLike: true,
  scale: 'cosmic',
  detailLabel: 'Transient Event',
  shortLabel: 'Transient',
  plural: 'Transients',
} as const satisfies StructureSourceEntry;
