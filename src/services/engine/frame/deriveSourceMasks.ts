/**
 * deriveSourceMasks — recompute the galaxy catalog draw/pick bitmasks from settings.
 *
 * ### Single writer, derived output
 *
 * `state.sources.drawMask` / `pickMask` are not authoritative state — they
 * are a *derivation* of two inputs the user actually controls: each galaxy catalog's
 * `settings.galaxyCatalogs.items[id].enabled` flag, and that galaxy catalog's live fade
 * opacity. The single source of truth is the settings record; the bitmask is
 * a compiled, GPU-cheap projection of it. This function is the SINGLE writer
 * of those two masks, so they can never drift out of sync with settings the
 * way a hand-maintained parallel mirror (toggle X → also remember to flip the
 * mask) inevitably does. Recompute-from-truth replaces remember-to-update.
 *
 * ### Why draw and pick diverge
 *
 * The two masks answer different questions, so they read different inputs:
 *
 *   - **draw** uses `enabled || opacity > 0`. A just-hidden galaxy catalog keeps its
 *     draw bit while its fade-out tail is still above zero, so the layer ramps
 *     down smoothly instead of popping out the instant it's toggled off. The
 *     bit clears only once the fade has fully resolved to 0.
 *   - **pick** uses `enabled` alone. Picking follows *intent*, not pixels: a
 *     galaxy catalog toggled off is non-clickable immediately, even while it is still
 *     visibly fading. You should never click a layer you've just dismissed.
 *
 * ### Domain
 *
 * The loop packs bits only for `GALAXY_CATALOG_SOURCES` — the galaxy catalog source codes that
 * own bit positions in the 32-bit mask. Structure / filament / volume codes
 * never had bits, and `ALL_VISIBLE_MASK` is built from exactly this set, so
 * packing from these codes covers the whole mask domain.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { GalaxyCatalogId } from '../../../@types/engine/data/GalaxyCatalogId';
import { GALAXY_CATALOG_SOURCES, SOURCE_REGISTRY } from '../../../data/sources';
import { maskWith } from '../../../utils/sourceMask';

export function deriveSourceMasks(
  state: Pick<EngineState, 'sources' | 'settings' | 'subsystems'>,
): void {
  let draw = 0;
  let pick = 0;
  for (const src of GALAXY_CATALOG_SOURCES) {
    // `src ∈ GALAXY_CATALOG_SOURCES` ⇒ its registry id is a galaxy catalog id; the broad
    // `SourceId` typing on `.id` doesn't know that, so the cast is safe.
    const id = SOURCE_REGISTRY[src].id as GalaxyCatalogId;
    const enabled = state.settings.galaxyCatalogs.items[id].enabled;
    const opacity = state.subsystems.fades.opacityOf({ kind: 'galaxyCatalog', source: src });
    // Draw through the fade-out tail so a hidden galaxy catalog ramps down smoothly.
    if (enabled || opacity > 0) draw = maskWith(draw, src);
    // Pick on intent only — unclickable the instant it's toggled off.
    if (enabled) pick = maskWith(pick, src);
  }
  state.sources.drawMask = draw;
  state.sources.pickMask = pick;
}
