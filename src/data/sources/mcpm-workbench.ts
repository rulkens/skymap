import type { VolumeSourceEntry } from '../../@types/data/volume/VolumeSourceEntry';
import { Source } from '../source';

export const MCPM_WORKBENCH_ENTRY = {
  type: 'volume',
  code: Source.McpmWorkbench,
  id: 'mcpm-workbench',
  label: 'MCPM Workbench (promoted)',
  allSky: true, // same physical field as MCPM/Polyphorm2MRS, whatever footprint the promoted run covers
  // Stays false until Phase 4 validation clears — the workbench dev tool's
  // exports aren't vetted against the shipped MCPM/Polyphorm reference yet.
  // No UI toggle work ships with this row; flipping this is Phase 4's call.
  visible: false,
  bearsLabel: false,
  bearsMarker: false,
  binBaseName: 'mcpm-workbench',
  tiered: false, // one cube per workbench run; no per-tier variants
  // Same physical quantity as MCPM/Polyphorm2MRS (log-normalized MCPM trace
  // density), so its presentation defaults mirror theirs — distinct palette
  // (magma, not MCPM's inferno or Polyphorm2MRS's viridis) to tell the three apart.
  paletteId: 'magma',
  contrast: 1.7,
  contrastCenter: 0.0,
  densityScale: 18.0,
  envelope: { inner: 0.85, outer: 1.05 },
  exposure: 18.0,
  trim: 0.3,
  intensity: 1.0,
} as const satisfies VolumeSourceEntry;
