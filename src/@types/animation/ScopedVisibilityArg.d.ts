/**
 * ScopedVisibilityArg — a `'family:scope'` entry in a `show()`/`hide()` layer
 * list that addresses ONE item (or one named slice) of a per-item layer,
 * where the bare `VisibilityLayerKey` would fan out over every item.
 *
 *   - `survey:<catalogId>`      — one galaxy catalog's visibility
 *                                 (`survey:milliquas` = the deep-field reveal).
 *   - `structureRing:<id>`      — one structure category's rings
 *                                 (`structureRing:group`; structure settings
 *                                 items ARE the four categories).
 *   - `label:<scope>`           — the unified label namespace:
 *                                 `label:milkyWay` (the MW label),
 *                                 `label:survey` (famous-galaxy names),
 *                                 `label:structure` (all structure labels),
 *                                 `label:<StructureId>` (one category's labels,
 *                                 e.g. `label:group`).
 *
 * Template-literal typing keeps the strings honest — `'survey:bogus'` is a
 * compile error. Unlike the `'labels'` aggregate (which expands to atomic keys
 * at construction), a scoped entry cannot flatten to a `VisibilityLayerKey`: it
 * survives into the compiled cue and `applySceneEffect` dispatches its targeted
 * settings action at fire time (`scopedVisibilityActions`). The fade rides the
 * reactive settings→fade bridge, so a custom `over` applies to atomic layers
 * only.
 */

import type { GalaxyCatalogId } from '../data/galaxyCatalog/GalaxyCatalogId';
import type { StructureId } from '../data/structure/StructureId';

export type ScopedVisibilityArg =
  | `survey:${GalaxyCatalogId}`
  | `structureRing:${StructureId}`
  | `label:${'milkyWay' | 'survey' | 'structure' | StructureId}`;
