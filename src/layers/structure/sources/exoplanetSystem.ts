import type { StructureSourceEntry } from '../../../@types/data/structure/StructureSourceEntry';
import { Source } from '../../../data/source';

export const EXOPLANET_SYSTEM_ENTRY = {
  type: 'structure',
  code: Source.ExoplanetSystem,
  id: 'exoplanet-system',
  label: 'Exoplanet system',
  allSky: true,
  bearsLabel: true,
  bearsMarker: true,
  pointLike: true,
  scale: 'milkyWay',
  detailLabel: 'Exoplanet System',
  shortLabel: 'Exoplanet system',
  plural: 'Exoplanet systems',
} as const satisfies StructureSourceEntry;
