/**
 * The Layer's settings tuple — ONE authority, two readers: `layer.ts` (as
 * `settings`) and `appSettingsSlices`, which folds it in from HERE rather
 * than off `APP_COMPOSITION`: reading it there makes the settings root type
 * depend on the Layer's, which depends (via `ContentPass` → `PassState`) on
 * that same root type — a circular alias `tsc` refuses and tsgo does not see.
 */

import { biasSlice } from './biasSlice';
import { galaxyCatalogsSlice } from './galaxyCatalogsSlice';
import { thumbnailsSlice } from './thumbnailsSlice';

export const galaxyCatalogLayerSettings = [galaxyCatalogsSlice, biasSlice, thumbnailsSlice] as const;
