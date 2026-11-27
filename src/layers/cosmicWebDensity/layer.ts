/**
 * The cosmicWebDensity Layer: the Physarum density cubes (MCPM, Polyphorm
 * 2MRS, the MCPM workbench export) — one renderer holding every cube, its
 * additive upsample, the accumulation and detail-region planners, both passes, the retained
 * `cosmic-web-density` render target, one
 * slot and asset row per source row, its one show entry, and
 * both its SettingsPanel and DebugPanel sections.
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { HDR_TARGET_FORMAT } from '../../data/renderTargetFormats';
import { cosmicWebDensityLayerSettings } from './state/slices';
import { cosmicWebDensityVisibility } from './visibility';
import { COSMIC_WEB_DENSITY_SOURCE_ROWS } from './sources/cosmicWebDensitySourceRows';
import { create } from './create';
import { destroy } from './destroy';
import { cosmicWebDensityAccumulationPlanner } from './frame';
import { detailRegionPlanner } from './detailRegion/plan/detailRegionPlanner';
import { COSMIC_WEB_DENSITY_TARGET_SCALE } from './densityCubes/data/cosmicWebDensityTargetScale';
import { cosmicWebDensityPass } from './densityCubes/passes/cosmicWebDensityPass';
import { cosmicWebDensityUpsamplePass } from './densityCubes/passes/cosmicWebDensityUpsamplePass';
import { cosmicWebDensityAssetRows } from './densityCubes/load/cosmicWebDensityAssetRows';
import CosmicWebDensitySectionContainer from './densityCubes/ui/CosmicWebDensitySectionContainer';
import CosmicWebDensityTuningSectionContainer from './densityCubes/ui/CosmicWebDensityTuningSectionContainer';

export const cosmicWebDensityLayer = defineLayer({
  name: 'cosmicWebDensity',
  settings: cosmicWebDensityLayerSettings,
  visibility: cosmicWebDensityVisibility,
  sources: COSMIC_WEB_DENSITY_SOURCE_ROWS,
  targets: [
    {
      id: 'cosmic-web-density',
      format: HDR_TARGET_FORMAT,
      depth: null,
      // The cubes are bandlimited and dithered, so the upsample loses nothing.
      scale: COSMIC_WEB_DENSITY_TARGET_SCALE,
      clearValue: { r: 0, g: 0, b: 0, a: 0 },
      // The running mean lives in the target across frames, one texture per view.
      retained: true,
    },
  ],
  create,
  destroy,
  planners: (runtime) => [
    cosmicWebDensityAccumulationPlanner(runtime),
    detailRegionPlanner(runtime),
  ],
  // A typed handle onto the accumulation planner's result above (the store keys by planner name).
  passes: (runtime) => [
    cosmicWebDensityPass(runtime, cosmicWebDensityAccumulationPlanner(runtime)),
    cosmicWebDensityUpsamplePass(runtime),
  ],
  assets: cosmicWebDensityAssetRows,
  ui: [
    {
      slot: 'main',
      content: CosmicWebDensitySectionContainer,
      title: 'Cosmic web density',
    },
    { slot: 'debug', content: CosmicWebDensityTuningSectionContainer },
  ],
});
