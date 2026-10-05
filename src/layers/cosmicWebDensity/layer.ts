/**
 * The cosmicWebDensity Layer: the Physarum density cubes (MCPM, Polyphorm
 * 2MRS, the MCPM workbench export) — one renderer holding every cube, its
 * additive upsample, both passes, the `cosmic-web-density` render target, one
 * slot and asset row per source row, the master + per-cube fade rows, and
 * both its SettingsPanel and DebugPanel sections.
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { HDR_TARGET_FORMAT } from '../../data/renderTargetFormats';
import { cosmicWebDensityLayerSettings } from './state/slices';
import { COSMIC_WEB_DENSITY_SOURCE_ROWS } from './sources/cosmicWebDensitySourceRows';
import { create } from './create';
import { destroy } from './destroy';
import { cosmicWebDensityPass } from './passes/cosmicWebDensityPass';
import { cosmicWebDensityUpsamplePass } from './passes/cosmicWebDensityUpsamplePass';
import { cosmicWebDensityAssetRows } from './load/cosmicWebDensityAssetRows';
import { cosmicWebDensityFadeRows } from './present/cosmicWebDensityFadeRows';
import CosmicWebDensitySectionContainer from './ui/CosmicWebDensitySectionContainer';
import CosmicWebDensityTuningSectionContainer from './ui/CosmicWebDensityTuningSectionContainer';

export const cosmicWebDensityLayer = defineLayer({
  name: 'cosmicWebDensity',
  settings: cosmicWebDensityLayerSettings,
  sources: COSMIC_WEB_DENSITY_SOURCE_ROWS,
  targets: [
    {
      id: 'cosmic-web-density',
      format: HDR_TARGET_FORMAT,
      depth: null,
      // 1/9th the fragments (3² downsample) of the heaviest per-pixel raymarch:
      // the cubes are bandlimited and dithered, so the upsample loses nothing.
      scale: 3,
      clearValue: { r: 0, g: 0, b: 0, a: 0 },
    },
  ],
  create,
  destroy,
  passes: (runtime) => [cosmicWebDensityPass(runtime), cosmicWebDensityUpsamplePass(runtime)],
  assets: cosmicWebDensityAssetRows,
  fades: cosmicWebDensityFadeRows,
  ui: [
    { slot: 'main', content: CosmicWebDensitySectionContainer },
    { slot: 'debug', content: CosmicWebDensityTuningSectionContainer },
  ],
});
