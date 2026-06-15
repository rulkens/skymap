import type { VolumeSourceEntry } from '../../@types/data/VolumeSourceEntry';
import { Source } from '../source';

export const DEBUG_CARTESIAN_ENTRY = {
  type: 'volume',
  code: Source.DebugCartesian,
  id: 'debug-cartesian',
  label: 'Cartesian grid (debug)',
  allSky: true,
  visible: false,
  bearsLabel: false,
  bearsMarker: false,
  binBaseName: null,
  tiered: false,
  paletteId: 'viridis',
  contrast: 1.0,
  contrastCenter: 0.5,
  // A ray crosses ~8 grid planes per axis at default settings, so
  // integrated density is much higher than the Gaussian — 4× is
  // enough to saturate near intensity=1.0.
  densityScale: 4.0,
  envelope: { inner: 2.0, outer: 2.0 },
  exposure: 1.0,
  trim: 0.0,
} as const satisfies VolumeSourceEntry;
