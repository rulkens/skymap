/**
 * The whole synthetic-backstop policy as one pure read of the runtime's slots:
 * arm only when every enabled survey catalog has settled without usable data.
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
    const category = SOURCE_REGISTRY[code].category;
    if (category === 'synthetic') continue;
    const slot = runtime.points.get(code);
    if (slot === undefined) continue;

    const s = slot.state();
    // "This build cannot read the served .bin" — never arm the backstop that
    // would paper over the alert `installFormatVersionAlert` is raising. Read
    // from EVERY tier-fetched source, curated Famous included: a version bump
    // that only Famous has been rebaked for is still this build vs. that data.
    if (s.kind === 'error' && s.error instanceof FormatVersionError) return false;
    // Past the mismatch check, curated Famous is excluded both ways: a
    // Famous-only success must not suppress the backstop, and a Famous-only
    // failure must not trigger it.
    if (category !== 'survey') continue;

    if (s.kind === 'ready') {
      // `count > 0` is the only success: a catalog that resolves empty leaves
      // the user with nothing to look at, which is what the backstop is for.
      if (s.value.count > 0) anyWithData = true;
      continue;
    }
    if (s.kind === 'error') continue;
    // Still idle or in flight. A catalog the user has turned off never
    // transitions, so it counts as settled — the same intent bit the point
    // rows' own demand reads.
    if (settings.galaxyCatalogs.items[galaxyCatalogIdOf(code)]?.enabled === true) return false;
  }

  return !anyWithData;
}
