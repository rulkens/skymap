/**
 * The zoneOfAvoidance Layer: the galactic-plane dust-band guide — one
 * renderer, its additive upsample, both passes, the `zoa` render target, the
 * fade row, the world-space lettering, the selection row, the source entry,
 * its settings and its two DebugPanel/Labels-and-guides UI slots.
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { HDR_TARGET_FORMAT } from '../../data/renderTargetFormats';
import { zoneOfAvoidanceLayerSettings } from './state/slices';
import { ZONE_OF_AVOIDANCE_SOURCE_ROWS } from './sources/zoneOfAvoidanceSourceRows';
import { create } from './create';
import { destroy } from './destroy';
import { zoneOfAvoidancePass } from './passes/zoneOfAvoidancePass';
import { zoneOfAvoidanceUpsamplePass } from './passes/zoneOfAvoidanceUpsamplePass';
import { zoneOfAvoidanceFadeRows } from './present/zoneOfAvoidanceFadeRows';
import { produceZoneOfAvoidanceLettering } from './present/produceZoneOfAvoidanceLettering';
import { zoneOfAvoidanceSelectionRow } from './present/zoneOfAvoidanceSelectionRow';
import { zoneOfAvoidanceSettingsRow } from './ui/zoneOfAvoidanceSettingsRow';
import ZoneOfAvoidanceTuningSectionContainer from './ui/ZoneOfAvoidanceTuningSectionContainer';

export const zoneOfAvoidanceLayer = defineLayer({
  name: 'zoneOfAvoidance',
  settings: zoneOfAvoidanceLayerSettings,
  sources: ZONE_OF_AVOIDANCE_SOURCE_ROWS,
  targets: [
    {
      id: 'zoa',
      format: HDR_TARGET_FORMAT,
      depth: null,
      // 1/25th the fragments (5² downsample) — the band is smooth low-frequency
      // haze an upsample reconstructs losslessly, same reason as `volume`.
      scale: 5,
      clearValue: { r: 0, g: 0, b: 0, a: 0 },
    },
  ],
  create,
  destroy,
  passes: (runtime) => [zoneOfAvoidancePass(runtime), zoneOfAvoidanceUpsamplePass(runtime)],
  fades: zoneOfAvoidanceFadeRows,
  labels: () => ({
    world: [{ id: 'zoneOfAvoidanceLettering', produceLabels3D: produceZoneOfAvoidanceLettering }],
  }),
  selection: () => [zoneOfAvoidanceSelectionRow()],
  ui: [
    { slot: 'labelsAndGuides', content: zoneOfAvoidanceSettingsRow },
    { slot: 'debug', content: ZoneOfAvoidanceTuningSectionContainer },
  ],
});
