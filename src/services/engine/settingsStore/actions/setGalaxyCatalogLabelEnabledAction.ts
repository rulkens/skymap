/**
 * setGalaxyCatalogLabelEnabledAction — the thin imperative bridge flipping one galaxy catalog's
 * text-label-visibility flag. Runs the pure `setGalaxyCatalogLabelEnabled` reducer
 * through `store.setState`, the single place `galaxyCatalogs.items[id].labelEnabled` is
 * written, so React's `useSettingsStore(selectGalaxyCatalogItems)` subscriber wakes.
 * The galaxy catalog's `labelLayer` fade (when it bears one — famous carries
 * `galaxyNames`) stays in the handle setter — a render concern, not a settings
 * write.
 */

import type { SettingsStore } from '../createSettingsStore';
import type { GalaxyCatalogId } from '../../../../@types/engine/data/GalaxyCatalogId';
import { setGalaxyCatalogLabelEnabled } from '../reducers/setGalaxyCatalogLabelEnabled';

export function setGalaxyCatalogLabelEnabledAction(
  store: SettingsStore,
  id: GalaxyCatalogId,
  labelEnabled: boolean,
): void {
  store.setState((s) => setGalaxyCatalogLabelEnabled(s, id, labelEnabled));
}
