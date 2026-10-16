/**
 * sourceMaskOf — the galaxy catalog draw/pick bitmasks, projected from settings.
 *
 * Pure and computed on read, never cached: a stored mask would need a setter to
 * remember to refresh it. The two masks diverge on purpose:
 *   - draw: `enabled || opacity > 0`, so a just-hidden catalog fades out
 *     instead of popping.
 *   - pick: `enabled` alone; picking follows intent, so a dismissed catalog is
 *     unclickable at once even while it is still visibly fading.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { SourceMasks } from '../@types/SourceMasks';
import { GALAXY_CATALOG_SOURCES } from '../../../data/sources';
import { galaxyCatalogIdOf } from '../../../utils/galaxyCatalogIdOf';
import { maskWith } from '../../../utils/maskWith';

export function sourceMaskOf(
  state: Pick<EngineState, 'settings' | 'subsystems'>,
  nowMs: number,
): SourceMasks {
  let draw = 0;
  let pick = 0;
  for (const src of GALAXY_CATALOG_SOURCES) {
    // `src ∈ GALAXY_CATALOG_SOURCES` ⇒ its registry id is a galaxy catalog id;
    // `galaxyCatalogIdOf` contains the narrowing cast that the broad `SourceId`
    // typing on `.id` would otherwise force here.
    const id = galaxyCatalogIdOf(src);
    const enabled = state.settings.galaxyCatalogs.items[id].enabled;
    // Sampled at THIS frame's nowMs, not the registry's last-ticked clock
    // (`tick(nowMs)` runs at the frame TAIL, `runFrame`) — otherwise the mask
    // lags the fade by one frame and keeps a just-settled source drawing.
    const opacity = state.subsystems.fades.opacityOf({ kind: 'galaxyCatalog', id }, nowMs);
    // Draw through the fade-out tail so a hidden galaxy catalog ramps down smoothly.
    if (enabled || opacity > 0) draw = maskWith(draw, src);
    // Pick on intent only — unclickable the instant it's toggled off.
    if (enabled) pick = maskWith(pick, src);
  }
  return { draw, pick };
}
