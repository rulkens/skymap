/**
 * The Layer's two fade rows, unchanged in key and handle so the tour's
 * visibility actions and `VisibilityLayerKey` see exactly what they saw in
 * core's manifest. `survey` seeds at 0 and fades IN on arrival — the
 * demand-loaded asymmetry every asset-backed row carries.
 */

import { GALAXY_CATALOG_IDS } from '../../../data/galaxyCatalog/galaxyCatalogIds';
import { fadeLayerRow } from '../../../utils/animation/fadeLayerRow';

import type { FadeLayer } from '../../../@types/animation/FadeLayer';
import type { GalaxyCatalogRuntime } from '../types/GalaxyCatalogRuntime';

export function galaxyCatalogFadeRows(
  runtime: GalaxyCatalogRuntime,
): readonly FadeLayer<unknown>[] {
  return [
    // The famous-galaxy label fade reuses the galaxy handle and rides the
    // famous-galaxy "Labels" toggle, so both seed and intent read that one flag.
    fadeLayerRow({
      key: 'surveyLabel',
      expand: () => [undefined],
      handle: () => ({ kind: 'labelLayer', layer: 'galaxy' }),
      seed: (s) => (s.galaxyCatalogs.items.famousGalaxy.labelEnabled ? 1 : 0),
      intent: (s) => s.galaxyCatalogs.items.famousGalaxy.labelEnabled,
    }),
    fadeLayerRow({
      key: 'survey',
      expand: () => GALAXY_CATALOG_IDS,
      handle: (id) => ({ kind: 'galaxyCatalog', id }),
      seed: () => 0,
      intent: (s, id) => s.galaxyCatalogs.items[id].enabled,
      // Suppress the fade until the payload is committed, so an enable that
      // races its download does not burn the fade window invisibly. The slot
      // commit's per-item re-sync runs after upload, when this reads true.
      guard: (_state, id) => runtime.pointRenderer.hasCatalog(id),
      // No `post`: the draw/pick bitmasks are derived per frame.
    }),
  ];
}
