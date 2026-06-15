import type { VolumeSourceEntry } from '../../@types/data/VolumeSourceEntry';
import { Source } from '../source';

export const MCPM_ENTRY = {
  type: 'volume',
  code: Source.Mcpm,
  id: 'mcpm',
  label: 'MCPM Cosmic Web',
  allSky: true, // SDSS DR17 VAC, full SDSS volume
  // Default-on: this is the headline cosmic-web overlay; the global
  // intensity of 1.0 (set on this entry) gives it presence on first paint.
  visible: true,
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
  intensity: 1.0,
} as const satisfies VolumeSourceEntry;
