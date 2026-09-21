/**
 * The Layer's settings tuple — ONE authority, two readers: `layer.ts` (as
 * `settings`) and `appSettingsSlices`, which folds it in from HERE rather
 * than off `APP_COMPOSITION`: reading it there makes the settings root type
 * depend on the Layer's, which depends (via `ContentPass` → `PassState`) on
 * that same root type — a circular alias `tsc` refuses and tsgo does not see.
 */

import { biasSlice } from './bias/slice';
import { galaxyCatalogsSlice } from './galaxyCatalogs/slice';
import { thumbnailsSlice } from './thumbnails/slice';

export const galaxyCatalogLayerSettings = [galaxyCatalogsSlice, biasSlice, thumbnailsSlice] as const;
