import type { CosmicWebDensitySourceEntry } from '../../@types/data/volume/CosmicWebDensitySourceEntry';
import { Source } from '../source';

export const MCPM_ENTRY = {
  type: 'cosmicWebDensity',
  code: Source.Mcpm,
  id: 'mcpm',
  label: 'MCPM Cosmic Web',
  allSky: true, // SDSS DR17 VAC, full SDSS volume
  bearsLabel: false,
  bearsMarker: false,
  binBaseName: 'mcpm',
  tiered: true, // small / medium / large `.scfd` variants
  paletteId: 'inferno',
  contrast: 1.7,
  contrastCenter: 0.0,
  densityScale: 18.0,
  envelope: { inner: 0.85, outer: 1.05 },
  exposure: 18.0,
  trim: 0.3,
} as const satisfies CosmicWebDensitySourceEntry;
