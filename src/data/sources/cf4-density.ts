import type { VolumeSourceEntry } from '../../@types/data/VolumeSourceEntry';
import { Source } from '../source';

export const CF4_DENSITY_ENTRY = {
  type: 'volume',
  code: Source.Cf4Density,
  id: 'cf4-density',
  label: 'CF-4 DM density',
  allSky: true, // Valade 2024 reconstruction covers the full 256³ box
  // Default-off: the ~32 MB voxel payload is demand-loaded the first
  // time the user enables the field in the Volumes panel — not at boot.
  visible: false,
  bearsLabel: false,
  bearsMarker: false,
  // Underscore in the filename for legacy reasons; `id` mirrors it
  // in kebab-case for UI / settings keys.
  binBaseName: 'cf4_density',
  tiered: false, // single 256³ cube; no per-tier variants
  // Presentation defaults — see VolumeFieldDefaults docstrings for the
  // semantics of each knob, and the prior `volumeFieldDefaults.ts`
  // module header for the rationale behind these specific numbers.
  paletteId: 'coolwarm',
  contrast: 1.2,
  contrastCenter: 0.5,
  densityScale: 20.0,
  envelope: { inner: 0.9, outer: 1.0 },
  exposure: 1.0,
  trim: 0.0,
  // CF-4's calibrated coolwarm sits comfortably at the global default
  // — kept explicit so every volume entry carries the field.
  intensity: 0.5,
} as const satisfies VolumeSourceEntry;
