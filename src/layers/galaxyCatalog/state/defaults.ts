/**
 * galaxyCatalog — the Layer's externally-read default, seeding
 * `galaxyCatalogsSlice.initialState.provenance` and re-used by several
 * tests that need a no-op provenance fixture.
 */

import type { GalaxyProvenanceSettings } from '../../../@types/settings/GalaxyProvenanceSettings';

/**
 * Default provenance-axis settings — one row per `PROVENANCE_AXES` entry.
 * Every axis starts at the no-op state (no highlight tint, filter `'all'`):
 * these are debug-panel data-quality diagnostics for auditing which galaxies
 * have measured vs. estimated orientation/size, not a default look, so the
 * unaudited scene renders exactly as the catalogs describe it.
 */
export const DEFAULT_GALAXY_PROVENANCE: GalaxyProvenanceSettings = {
  orientation: { highlight: false, filter: 'all' },
  size: { highlight: false, filter: 'all' },
};
