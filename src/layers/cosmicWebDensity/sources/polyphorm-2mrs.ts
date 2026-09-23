import type { CosmicWebDensitySourceEntry } from '../../../@types/data/volume/CosmicWebDensitySourceEntry';
import { Source } from '../../../data/source';

export const POLYPHORM_2MRS_ENTRY = {
  type: 'cosmicWebDensity',
  code: Source.Polyphorm2MRS,
  id: 'polyphorm-2mrs',
  label: 'Polyphorm (2MRS)',
  allSky: true, // 2MRS footprint run, same all-sky framing as MCPM
  bearsLabel: false,
  bearsMarker: false,
  binBaseName: 'polyphorm-2mrs',
  tiered: true, // small / medium / large `.scfd` variants
  // Same physical quantity as MCPM (log-normalized MCPM trace density), so its
  // presentation defaults mirror MCPM's — INCLUDING the palette. The two are
  // shown together (the Cosmic Web view enables both) to close the sky MCPM's
  // SDSS wedge leaves open, and one continuous field should read as one field,
  // not two colours meeting at a footprint edge. Telling them apart is the
  // Cosmic web density section's job, not the ramp's.
  paletteId: 'inferno',
  contrast: 1.7,
  contrastCenter: 0.0,
  densityScale: 18.0,
  envelope: { inner: 0.85, outer: 1.05 },
  exposure: 18.0,
  trim: 0.3,
} as const satisfies CosmicWebDensitySourceEntry;
