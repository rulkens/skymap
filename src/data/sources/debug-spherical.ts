import type { VolumeSourceEntry } from '../../@types/data/volume/VolumeSourceEntry';
import { Source } from '../source';

export const DEBUG_SPHERICAL_ENTRY = {
  type: 'volume',
  code: Source.DebugSpherical,
  id: 'debug-spherical',
  label: 'Spherical grid (debug)',
  allSky: true,
  visible: false,
  bearsLabel: false,
  bearsMarker: false,
  binBaseName: null,
  tiered: false,
  paletteId: 'magma',
  contrast: 1.0,
  contrastCenter: 0.5,
  // A ray typically crosses one or two shells plus a spoke — sits
  // between Gaussian (sparse) and Cartesian (dense) integrated density.
  densityScale: 6.0,
  envelope: { inner: 2.0, outer: 2.0 },
  exposure: 1.0,
  trim: 0.0,
} as const satisfies VolumeSourceEntry;
