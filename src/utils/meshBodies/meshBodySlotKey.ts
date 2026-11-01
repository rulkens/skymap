import type { AssetKey } from '../../@types/loading/AssetKey';

/** meshBodySlotKey — the single home for the `mesh:` prefix on a mesh body's
 *  `AssetWiringRow.key`. */
export function meshBodySlotKey(id: string): AssetKey {
  return `mesh:${id}` as AssetKey;
}
