/**
 * The Layer's one fade row: the curated star-map captions. Seeded in code,
 * not demand-loaded, so no `guard`. Unchanged key and handle so the tour's
 * visibility actions and `VisibilityLayerKey` see exactly what they saw in
 * core's manifest.
 */

import type { FadeLayer } from '../../../@types/animation/FadeLayer';
import { fadeLayerRow } from '../../../utils/animation/fadeLayerRow';
import { STAR_CATALOG_SOURCE_ROWS } from '../sources/starCatalogSourceRows';

// The survey Gaia bin draws no per-star names, so its handle would be a
// controller nothing can move. A single-param `.filter` (not the destructured
// tuple directly) is what lets `tsc`'s inferred type predicate narrow `id` to
// `LabelCategory` — the same shape `LABEL_CATEGORIES` filters over.
const STAR_CATALOG_ENTRIES = STAR_CATALOG_SOURCE_ROWS.map(([, entry]) => entry);
const LABEL_BEARING_STAR_CATALOG_IDS = STAR_CATALOG_ENTRIES.filter((e) => e.bearsLabel).map(
  (e) => e.id,
);

export function starCatalogFadeRows(): readonly FadeLayer<unknown>[] {
  return [
    fadeLayerRow({
      key: 'starCatalogLabel',
      expand: () => LABEL_BEARING_STAR_CATALOG_IDS,
      handle: (id) => ({ kind: 'labelLayer', layer: 'starCatalog', item: id }),
      seed: (s, id) => (s.starCatalogs.items[id].labelEnabled ? 1 : 0),
      intent: (s, id) => s.starCatalogs.items[id].labelEnabled,
    }),
  ];
}
