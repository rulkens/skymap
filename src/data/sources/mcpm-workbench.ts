import type { VolumeSourceEntry } from '../../@types/data/volume/VolumeSourceEntry';
import { Source } from '../source';

export const MCPM_WORKBENCH_ENTRY = {
  type: 'volume',
  code: Source.McpmWorkbench,
  id: 'mcpm-workbench',
  label: 'MCPM Workbench (promoted)',
  allSky: true, // same physical field as MCPM/Polyphorm2MRS, whatever footprint the promoted run covers
  // Hidden pending a promotion decision, not a known defect: the workbench's
  // total trace mass sits a uniform ~9.28x below the reference VAC, ruled a
  // documented offset (see docs/research/mcpm-trace-mass-offset.md) after
  // quirks/structure/f16 were eliminated as causes. No UI toggle ships with
  // this row; flipping this is a separate call.
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
