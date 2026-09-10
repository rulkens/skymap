import type { AssetKey } from '../../@types/loading/AssetKey';

/**
 * meshBodySlotKey — build the `AssetWiringRow.key` for a mesh body's demand
 * row: the `mesh:`-prefixed id, the single home for that prefix so it can
 * never drift from what `isMeshBodyKey`/`slotFor` expect.
 */
export function meshBodySlotKey(id: string): AssetKey {
  return `mesh:${id}` as AssetKey;
}
