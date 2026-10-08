import type { StructureSourceEntry } from '../../@types/data/structure/StructureSourceEntry';
import { Source } from '../source';

export const GALAXY_GROUP_ENTRY = {
  type: 'structure',
  code: Source.GalaxyGroup,
  id: 'galaxy-group',
  label: 'Galaxy group',
  allSky: true,
  bearsLabel: true,
  bearsMarker: true,
  scale: 'cosmic',
  labelLayer: 'structure',
  detailLabel: 'Galaxy Group',
  shortLabel: 'Galaxy group',
  plural: 'Galaxy groups',
} as const satisfies StructureSourceEntry;
