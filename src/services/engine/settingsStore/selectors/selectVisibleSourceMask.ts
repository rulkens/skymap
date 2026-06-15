/**
 * selectVisibleSourceMask — pure projection of the per-galaxy-catalog `enabled` bits
 * into the 32-bit galaxy-catalog-visibility bitmask the SettingsPanel checkboxes read.
 *
 * ### Why a selector, not a stored field
 *
 * The bitmask is NOT authoritative state — it is a compiled projection of the
 * per-galaxy-catalog `items[id].enabled` flags, exactly as `deriveSourceMasks` packs
 * `state.sources.pickMask`. Before the store migration React kept a parallel
 * `visibleSourceMask` cell fed by an `onMaskChange` echo; that mirror could
 * drift from the authoritative bits. Deriving it on read instead — one source
 * of truth, projected the same way on both the engine (`deriveSourceMasks`) and
 * the React (this selector) sides — removes the mirror.
 *
 * ### Why it matches the `pick` mask, not `draw`
 *
 * `deriveSourceMasks` emits two masks: `draw` (intent OR fade-out tail) and
 * `pick` (intent only). This selector reproduces `pick` — pure intent from the
 * `enabled` flags — because that's the bitmask the panel checkboxes reflect
 * (the echo it replaces sent `pickMask`). The fade-tail `draw` bits depend on
 * live fade opacity, which the store does not hold; the panel never wanted
 * them. Iterating `GALAXY_CATALOG_SOURCES` (the only codes that own bit positions) in
 * the same order with the same `maskWith` keeps this bit-identical to
 * `deriveSourceMasks`' `pick` output for any given enabled-set.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';
import type { GalaxyCatalogId } from '../../../../@types/engine/data/GalaxyCatalogId';
import { GALAXY_CATALOG_SOURCES, SOURCE_REGISTRY } from '../../../../data/sources';
import { maskWith } from '../../../../utils/maskWith';

export function selectVisibleSourceMask(state: EngineSettingsState): number {
  let mask = 0;
  for (const src of GALAXY_CATALOG_SOURCES) {
    // `src ∈ GALAXY_CATALOG_SOURCES` ⇒ its registry id is a galaxy catalog id; the broad
    // `SourceId` typing on `.id` doesn't know that, so the cast is safe.
    const id = SOURCE_REGISTRY[src].id as GalaxyCatalogId;
    if (state.galaxyCatalogs.items[id].enabled) mask = maskWith(mask, src);
  }
  return mask;
}
