/**
 * selectGalaxyCatalogItems — returns the RAW per-galaxy-catalog settings Record, by reference.
 *
 * Companion to `selectStructureItems`: the label-visibility view the
 * SettingsPanel renders spans structure categories AND the one label-bearing
 * galaxy catalog (`famousGalaxy`, whose `labelEnabled` lives here, not on a structure
 * row). The React consumer feeds this stable Record alongside the structure
 * items into `projectLabelCategoryVisibility`'s `useMemo`.
 *
 * ### Why the raw Record (same stable-ref reasoning as the structure items)
 *
 * `useSyncExternalStore`'s `getSnapshot` must return a referentially-stable
 * value when nothing changed. Returning `state.galaxyCatalogs.items` verbatim keeps it
 * stable under copy-on-write — the reference changes only when a galaxy catalog row
 * actually changes (a per-galaxy-catalog reducer spreads a new `items`), and is
 * UNCHANGED when a sibling leaf like `galaxyCatalogs.brightness` is set. Projecting a
 * derived map inside the selector would mint a fresh object per read and break
 * that contract.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';
import type { GalaxyCatalogId } from '../../../../@types/data/galaxyCatalog/GalaxyCatalogId';
import type { GalaxyCatalogItemSettings } from '../../../../@types/settings/GalaxyCatalogItemSettings';

export function selectGalaxyCatalogItems(
  state: EngineSettingsState,
): Record<GalaxyCatalogId, GalaxyCatalogItemSettings> {
  return state.galaxyCatalogs.items;
}
