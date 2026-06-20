/**
 * willSourceReload — the single source of truth for "does this galaxy-catalog
 * source re-fetch its `.bin` on a given prev→next tier swap?".
 *
 * ## Why this exists
 *
 * The tier swap has a producer/consumer pair that must agree on exactly which
 * sources reload:
 *
 *   - `makeRunTierTransition` is the PRODUCER — it loops the registry and fires
 *     a `.load()` (which eventually dispatches `catalogLoaded`) only for the
 *     sources whose data actually changes across the swap.
 *   - `captureGalaxyFocusIds` feeds the CONSUMER — the re-anchor saga does
 *     `take(catalogLoaded for source)` for every captured ref, and that take
 *     blocks forever if it waits on a source the runner never reloaded.
 *
 * When the skip predicate was hand-copied into both modules, the two could
 * drift and hang the re-anchor take. Folding it into one function makes that
 * impossible: capture asks the same question the runner answers.
 */

import { GALAXY_CATALOG_SOURCE_REGISTRY } from './galaxyCatalogSourceRegistry';
import { tierTarget } from '../../../data/tierTargets';
import { galaxyCatalogIdOf } from '../../../utils/galaxyCatalogIdOf';
import type { SourceType } from '../../../@types/data/SourceType';
import type { Tier } from '../../../@types/data/Tier';
import type { EngineSettingsState } from '../../../@types/settings/EngineSettingsState';

export function willSourceReload(
  source: SourceType,
  prevTier: Tier,
  nextTier: Tier,
  settings: EngineSettingsState,
): boolean {
  const cfg = GALAXY_CATALOG_SOURCE_REGISTRY.find((c) => c.source === source);
  // Synthetic is generated procedurally, never tier-fetched — no catalogLoaded.
  // This clause MUST precede the `items[...]` access below: synthetic has no
  // items entry, so reading `.enabled` for it would throw.
  if (!cfg || cfg.category === 'synthetic') return false;
  // Same tier target → the slot doesn't re-fetch, so no catalogLoaded arrives.
  if (tierTarget(source, prevTier) === tierTarget(source, nextTier)) return false;
  // Disabled intent → makeRunTierTransition skips the load, so none fires either.
  if (!settings.galaxyCatalogs.items[galaxyCatalogIdOf(source)].enabled) return false;
  return true;
}
