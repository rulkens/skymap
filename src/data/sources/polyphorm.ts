import type { VolumeSourceEntry } from '../../@types/data/volume/VolumeSourceEntry';
import { Source } from '../source';

export const POLYPHORM_ENTRY = {
  type: 'volume',
  code: Source.Polyphorm,
  id: 'polyphorm-2mrs',
  label: 'Polyphorm (2MRS)',
  allSky: true, // 2MRS footprint run, same all-sky framing as MCPM
  // Default-off: a test field the user toggles on from the Volumes panel.
  visible: false,
  bearsLabel: false,
  bearsMarker: false,
  binBaseName: 'polyphorm-2mrs',
  tiered: true, // small / medium / large `.scfd` variants
  // Same physical quantity as MCPM (log-normalized MCPM trace density), so
  // its presentation defaults mirror MCPM's — distinct palette (viridis,
  // not MCPM's inferno) to tell the two apart on screen.
  paletteId: 'viridis',
  contrast: 1.7,
  contrastCenter: 0.0,
  densityScale: 18.0,
  envelope: { inner: 0.85, outer: 1.05 },
  exposure: 18.0,
  trim: 0.3,
  intensity: 1.0,
} as const satisfies VolumeSourceEntry;
