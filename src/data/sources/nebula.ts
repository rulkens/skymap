import type { StructureSourceEntry } from '../../@types/data/structure/StructureSourceEntry';
import { Source } from '../source';

export const NEBULA_ENTRY = {
  type: 'structure',
  code: Source.Nebula,
  id: 'nebula',
  label: 'Nebula',
  allSky: true,
  bearsLabel: true,
  bearsMarker: true,
  slab: 'near0',
  galaxyMembers: false,
  labelLayer: 'structure',
  detailLabel: 'Nebula',
  shortLabel: 'Nebula',
  plural: 'Nebulae',
} as const satisfies StructureSourceEntry;
