/**
 * The Layer's settings tuple — ONE authority, two readers: `layer.ts` (as
 * `settings`) and `appSettingsFragments`, which folds it in from HERE rather
 * than off `APP_COMPOSITION`: reading it there makes the settings root type
 * depend on the Layer's, which depends (via `ContentPass` → `PassState`) on
 * that same root type — a circular alias `tsc` refuses and tsgo does not see.
 */

import { galaxyCatalogsSettingsFragment } from './galaxyCatalogsSettings';

export const galaxyCatalogLayerSettings = [galaxyCatalogsSettingsFragment] as const;
