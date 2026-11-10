import type { CosmicWebFilamentsSourceEntry } from '../../../@types/data/filament/CosmicWebFilamentsSourceEntry';

export const FILAMENTS_ENTRY = {
  type: 'cosmicWebFilaments',
  id: 'filaments',
  label: 'Filaments',
  allSky: true, // full-sky DisPerSE skeleton
  bearsLabel: false,
  bearsMarker: false,
  binBaseName: 'filaments',
} as const satisfies CosmicWebFilamentsSourceEntry;
