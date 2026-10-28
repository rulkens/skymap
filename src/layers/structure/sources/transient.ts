import type { StructureSourceEntry } from '../../../@types/data/structure/StructureSourceEntry';
import { Source } from '../../../data/source';

export const TRANSIENT_ENTRY = {
  type: 'structure',
  code: Source.Transient,
  id: 'transient',
  label: 'Transient',
  allSky: true,
  bearsLabel: true,
  bearsMarker: true,
  scale: 'cosmic',
  detailLabel: 'Transient Event',
  shortLabel: 'Transient',
  plural: 'Transients',
} as const satisfies StructureSourceEntry;
