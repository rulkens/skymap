import type { AssetKey } from '../../@types/loading/AssetKey';

/** meshBodySlotKey — the single home for the `mesh:` prefix, so `AssetWiringRow.key`
 *  can never drift from what `isMeshBodyKey`/`slotFor` expect. */
export function meshBodySlotKey(id: string): AssetKey {
  return `mesh:${id}` as AssetKey;
}
