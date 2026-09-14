/**
 * willSourceReload — "does this galaxy-catalog source re-fetch its `.bin` on a
 * given prev→next tier swap?", as a predicate over the registry's tier targets
 * and the source's enabled intent.
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
  // Disabled intent → the slot is never demanded, so no load starts either.
  if (!settings.galaxyCatalogs.items[galaxyCatalogIdOf(source)].enabled) return false;
  return true;
}
