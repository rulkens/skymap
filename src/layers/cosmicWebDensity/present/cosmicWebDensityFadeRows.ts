/**
 * The Layer's two fade rows: the master and one per cube. Their `key` and
 * `handle` are load-bearing — the tour's visibility actions and
 * `VisibilityLayerKey` address them. A cube row seeds at 0 and fades IN on
 * arrival: its guard flips when the slot's commit uploads the cube.
 */

import { fadeLayerRow } from '../../../utils/animation/fadeLayerRow';
import { COSMIC_WEB_DENSITY_SOURCE_ROWS } from '../sources/cosmicWebDensitySourceRows';

import type { FadeLayer } from '../../../@types/animation/FadeLayer';
import type { CosmicWebDensityFieldId } from '../../../@types/data/volume/CosmicWebDensityFieldId';
import type { CosmicWebDensityRuntime } from '../@types/CosmicWebDensityRuntime';

const FIELD_IDS: readonly CosmicWebDensityFieldId[] = COSMIC_WEB_DENSITY_SOURCE_ROWS.map(
  ([, entry]) => entry.id,
);

export function cosmicWebDensityFadeRows(
  runtime: CosmicWebDensityRuntime,
): readonly FadeLayer<unknown>[] {
  return [
    fadeLayerRow({
      key: 'cosmicWebDensity',
      expand: () => [undefined],
      handle: () => ({ kind: 'cosmicWebDensity' }),
      seed: (s) => (s.cosmicWebDensity.enabled ? 1 : 0),
      intent: (s) => s.cosmicWebDensity.enabled,
    }),
    fadeLayerRow<CosmicWebDensityFieldId, 'cosmicWebDensityField'>({
      key: 'cosmicWebDensityField',
      expand: () => FIELD_IDS,
      handle: (id) => ({ kind: 'cosmicWebDensityField', id }),
      seed: () => 0,
      intent: (s, id) => s.cosmicWebDensity.items[id].enabled,
      guard: (_state, id) => runtime.renderer.listIds().includes(id),
    }),
  ];
}
