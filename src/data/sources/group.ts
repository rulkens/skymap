import type { StructureSourceEntry } from '../../@types/data/StructureSourceEntry';
import { Source } from '../source';

export const GROUP_ENTRY = {
  type: 'structure',
  code: Source.Group,
  id: 'group',
  label: 'Group',
  allSky: true,
  visible: true,
  bearsLabel: true,
  bearsMarker: true,
  labelLayer: 'structure',
  detailLabel: 'Galaxy Group',
  shortLabel: 'Group',
  plural: 'Groups',
} as const satisfies StructureSourceEntry;
