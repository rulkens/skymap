/**
 * The whole synthetic-backstop policy as one pure read of the runtime's slots:
 * arm only when every enabled survey catalog has settled without usable data.
 * It can be a predicate now that the `count` lives behind the same closure —
 * the thing `DemandCtx` could not see, and the only reason the gate it
 * replaces had to be imperative.
 */

import { FormatVersionError } from '../../../data/formatVersionError';
import { GALAXY_CATALOG_SOURCES, SOURCE_REGISTRY } from '../../../data/sources';
import { galaxyCatalogIdOf } from '../../../utils/galaxyCatalogIdOf';

import type { EngineSettingsState } from '../../../@types/settings/EngineSettingsState';
import type { GalaxyCatalogRuntime } from '../types/GalaxyCatalogRuntime';

export function syntheticShouldArm(
  runtime: GalaxyCatalogRuntime,
  settings: Readonly<EngineSettingsState>,
): boolean {
  let anyWithData = false;

  for (const code of GALAXY_CATALOG_SOURCES) {
    // Curated Famous is excluded both ways: a Famous-only success must not
    // suppress the backstop, and a Famous-only failure must not trigger it.
    if (SOURCE_REGISTRY[code].category !== 'survey') continue;
    const slot = runtime.points.get(code);
    if (slot === undefined) continue;

    const s = slot.state();
    if (s.kind === 'ready') {
      // `count > 0` is the only success: a catalog that resolves empty leaves
      // the user with nothing to look at, which is what the backstop is for.
      if (s.value.count > 0) anyWithData = true;
      continue;
    }
    if (s.kind === 'error') {
      // "This build cannot read the served .bin" — never arm the backstop that
      // would paper over the alert `installFormatVersionAlert` is raising.
      if (s.error instanceof FormatVersionError) return false;
      continue;
    }
    // Still idle or in flight. A catalog the user has turned off never
    // transitions, so it counts as settled — the same intent bit the point
    // rows' own demand reads.
    if (settings.galaxyCatalogs.items[galaxyCatalogIdOf(code)]?.enabled === true) return false;
  }

  return !anyWithData;
}
