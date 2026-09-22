import type { CosmicWebFilamentsSourceEntry } from '../../../@types/data/filament/CosmicWebFilamentsSourceEntry';
import { Source } from '../../../data/source';

export const FILAMENTS_ENTRY = {
  type: 'cosmicWebFilaments',
  code: Source.Filaments,
  id: 'filaments',
  label: 'Filaments',
  allSky: true, // full-sky DisPerSE skeleton
  // Off by default — the line geometry overlays the cosmic-web wedge
  // and most users want the points-only view first. They can flip it
  // on in the SettingsPanel.
  visible: false,
  bearsLabel: false,
  bearsMarker: false,
  binBaseName: 'filaments',
  // 1.0 is the unit baseline; user scales it down for a subtler overlay
  // or up for emphasis via the (future) Filaments slider.
  intensity: 1.0,
} as const satisfies CosmicWebFilamentsSourceEntry;
