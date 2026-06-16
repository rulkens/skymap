/**
 * deriveSourceMasks — project the galaxy catalog draw/pick bitmasks from settings.
 *
 * ### A pure projection, applied by the caller
 *
 * The two masks are not authoritative state — they are a *derivation* of two
 * inputs the user actually controls: each galaxy catalog's
 * `settings.galaxyCatalogs.items[id].enabled` flag, and that galaxy catalog's live
 * fade opacity. The single source of truth is the settings record; the bitmask is
 * a compiled, GPU-cheap projection of it. This function computes that projection
 * and RETURNS it as a `SourceMasks` value — it writes nothing. Each caller decides
 * where to apply the result: `runFrame` derives it once per frame and threads it
 * into the render + pick passes; the click path derives it fresh at click time.
 * Computing on read (rather than caching a field a setter must remember to
 * refresh) is what keeps the masks from ever drifting out of sync with settings.
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
import type { SourceMasks } from '../../../@types/engine/frame/SourceMasks';
import { GALAXY_CATALOG_SOURCES } from '../../../data/sources';
import { galaxyCatalogIdOf } from '../../../utils/galaxyCatalogIdOf';
import { maskWith } from '../../../utils/maskWith';

export function deriveSourceMasks(
  state: Pick<EngineState, 'settings' | 'subsystems'>,
): SourceMasks {
  let draw = 0;
  let pick = 0;
  for (const src of GALAXY_CATALOG_SOURCES) {
    // `src ∈ GALAXY_CATALOG_SOURCES` ⇒ its registry id is a galaxy catalog id;
    // `galaxyCatalogIdOf` contains the narrowing cast that the broad `SourceId`
    // typing on `.id` would otherwise force here.
    const id = galaxyCatalogIdOf(src);
    const enabled = state.settings.galaxyCatalogs.items[id].enabled;
    const opacity = state.subsystems.fades.opacityOf({ kind: 'galaxyCatalog', id });
    // Draw through the fade-out tail so a hidden galaxy catalog ramps down smoothly.
    if (enabled || opacity > 0) draw = maskWith(draw, src);
    // Pick on intent only — unclickable the instant it's toggled off.
    if (enabled) pick = maskWith(pick, src);
  }
  return { draw, pick };
}
