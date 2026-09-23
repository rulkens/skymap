import type { CosmicWebFilamentsSourceEntry } from '../../../@types/data/filament/CosmicWebFilamentsSourceEntry';
import { Source } from '../../../data/source';

export const FILAMENTS_ENTRY = {
  type: 'cosmicWebFilaments',
  code: Source.Filaments,
  id: 'filaments',
  label: 'Filaments',
  allSky: true, // full-sky DisPerSE skeleton
  bearsLabel: false,
  bearsMarker: false,
  binBaseName: 'filaments',
} as const satisfies CosmicWebFilamentsSourceEntry;
