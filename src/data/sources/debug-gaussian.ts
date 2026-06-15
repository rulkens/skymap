import type { VolumeSourceEntry } from '../../@types/data/VolumeSourceEntry';
import { Source } from '../source';

// ── DEV-only synthetic volume fixtures ────────────────────────────
// Procedural cubes used to verify axis alignment, scale, and origin.
// `binBaseName: null` because they have no on-disk payload; the slot
// factory generates them in `import.meta.env.DEV` builds.
// `envelope: { inner: 2.0, outer: 2.0 }` (both >= √3) keeps the cube
// corners visible — the whole point of these fixtures.
export const DEBUG_GAUSSIAN_ENTRY = {
  type: 'volume',
  code: Source.DebugGaussian,
  id: 'debug-gaussian',
  label: 'Gaussian (debug)',
  allSky: true,
  visible: false,
  bearsLabel: false,
  bearsMarker: false,
  binBaseName: null,
  tiered: false,
  paletteId: 'blue-purple',
  contrast: 1.0,
  contrastCenter: 0.5,
  // A single Gaussian peak integrates to roughly √(2π)·σ along its
  // central axis; 10× lifts the peak into saturation while leaving
  // the intensity slider plenty of low-end headroom.
  densityScale: 10.0,
  envelope: { inner: 2.0, outer: 2.0 },
  exposure: 1.0,
  trim: 0.0,
} as const satisfies VolumeSourceEntry;
