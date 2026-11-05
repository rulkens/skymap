import type { CosmicWebDensitySourceEntry } from '../../../@types/data/volume/CosmicWebDensitySourceEntry';
import { Source } from '../../../data/source';

export const MCPM_WORKBENCH_ENTRY = {
  type: 'cosmicWebDensity',
  code: Source.McpmWorkbench,
  id: 'mcpm-workbench',
  label: 'MCPM Workbench (promoted)',
  allSky: true, // same physical field as MCPM/Polyphorm2MRS, whatever footprint the promoted run covers
  bearsLabel: false,
  bearsMarker: false,
  binBaseName: 'mcpm-workbench',
  tiered: false, // one cube per workbench run; no per-tier variants
  // Same physical quantity as MCPM/Polyphorm2MRS (log-normalized MCPM trace
  // density), so its presentation defaults mirror theirs — distinct palette
  // (magma, where the two shipping runs both use inferno) so a promoted
  // workbench cube is unmistakable beside the reference it is judged against.
  paletteId: 'magma',
  contrast: 1.7,
  contrastCenter: 0.0,
  densityScale: 18.0,
  envelope: { inner: 0.85, outer: 1.05 },
  exposure: 18.0,
  trim: 0.3,
} as const satisfies CosmicWebDensitySourceEntry;
