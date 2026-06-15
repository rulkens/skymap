/**
 * setGalaxyCatalogVisibleAction — the thin imperative bridge flipping one galaxy catalog's
 * layer-visibility bit. Runs the pure `setGalaxyCatalogVisible` reducer through
 * `store.setState`, the single place the authoritative `items[id].enabled`
 * intent flag is written. The derived draw/pick bitmasks are recomputed
 * downstream (`deriveSourceMasks`) and projected for React (`selectVisibleSourceMask`).
 */

import type { SettingsStore } from '../createSettingsStore';
import type { GalaxyCatalogId } from '../../../../@types/engine/data/GalaxyCatalogId';
import { setGalaxyCatalogVisible } from '../reducers/setGalaxyCatalogVisible';

export function setGalaxyCatalogVisibleAction(store: SettingsStore, id: GalaxyCatalogId, enabled: boolean): void {
  store.setState((s) => setGalaxyCatalogVisible(s, id, enabled));
}
