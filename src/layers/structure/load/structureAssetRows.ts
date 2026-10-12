/**
 * The Layer's one asset row, the bulk cluster/supercluster/void coverage —
 * demand + request only; the `factory` hands back the slot `create` already
 * minted, so core folds this over its own rows without ever building one.
 */

import type { AssetWiringRow } from '../../../@types/loading/AssetWiringRow';
import type { StructureId } from '../../../@types/data/structure/StructureId';
import type { StructureRuntime } from '../@types/StructureRuntime';

/**
 * The categories backed by the bulk `.ccat` — their visibility gates its fetch.
 * `famousGalaxy` (own `.bin`) and `galaxy-group` (seed-only, no `.ccat`) are excluded;
 * adding it here would fetch the catalog whenever group visibility toggles.
 */
const BULK_CATALOG_CATEGORIES: readonly StructureId[] = ['galaxy-cluster', 'supercluster', 'void'];

export function structureAssetRows(
  runtime: Pick<StructureRuntime, 'slot'>,
): readonly AssetWiringRow[] {
  return [
    {
      key: 'structureCatalog',
      factory: () => runtime.slot,
      req: () => ({}),
      // The structures-enabled proxy: loads when ANY bulk category has its ring OR
      // its label on, both axes read from the per-category item rows.
      demand: (ctx) =>
        BULK_CATALOG_CATEGORIES.some(
          (cat) =>
            ctx.settings.structures.items[cat].enabled ||
            ctx.settings.structures.items[cat].labelEnabled,
        ),
      priority: 30, // a small .ccat that draws across many rungs at once — high value per byte
    },
  ];
}
