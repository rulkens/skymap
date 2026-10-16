/**
 * selectToggleRows — every Labels & Guides checkbox, in panel order: one row per label category
 * (`LABEL_CATEGORIES`, registry-code order), then each Layer row in composition order, read and written through
 * the show entry it names. Lives in `compositions/` because it reads five Layers' label homes and `APP_VISIBILITY`,
 * which nothing under `state/` may import.
 *
 * Referentially stable: an unrelated store write returns the same array, so the `memo` section behind it does not
 * re-render. The label homes are per-cluster selector outputs and each Layer row's value is a boolean key, never
 * `state.settings` itself, which Immer re-identifies on every write. The memo has one slot: every caller must pass
 * the same `layerRows` array, or alternating calls rebuild the rows each time.
 */
import { createSelector } from '@reduxjs/toolkit';
import { selectStructureItems } from '../layers/structure/state/structures/selectors';
import { selectGalaxyCatalogItems } from '../layers/galaxyCatalog/state/galaxyCatalogs/selectors';
import { selectStarCatalogItems } from '../layers/starCatalog/state/starCatalogs/selectors';
import { selectBodyItems } from '../layers/body/state/bodies/selectors';
import { selectBlackHoleItems } from '../layers/blackHoles/state/blackHoles/selectors';
import { selectMilkyWayLabelEnabled } from '../layers/milkyWay/state/milkyWay/selectors';
import { projectLabelCategoryVisibility } from '../state/settings/projectLabelCategoryVisibility';
import { LABEL_HOME_BY_SOURCE_TYPE } from '../data/labels/labelHomeBySourceType';
import { SOURCE_TYPE_BY_LABEL_CATEGORY } from '../data/labels/sourceTypeByLabelCategory';
import { LABEL_CATEGORIES } from '../data/structure/labelCategories';
import { CATEGORY_DISPLAY_INFO } from '../data/structure/categoryDisplayInfo';
import { memoizeLastByKeys } from '../utils/cache/memoizeLastByKeys';
import { visibilityEntryOf } from '../utils/visibility/visibilityEntryOf';
import { visibilitySwitchOf } from '../utils/visibility/visibilitySwitchOf';
import { setVisibility } from '../state/settings/setVisibilityAction';
import { APP_VISIBILITY } from './appVisibility';
import type { ToggleRow } from '../@types/settings/ToggleRow';
import type { LayerToggleRow } from '../@types/engine/layer/LayerToggleRow';
import type { ShowEntry } from '../@types/engine/layer/ShowEntry';
import type { RootState } from '../store/types';

const selectLabelCategoryVisibility = createSelector(
  [
    selectStructureItems,
    selectGalaxyCatalogItems,
    selectStarCatalogItems,
    selectBodyItems,
    selectBlackHoleItems,
    selectMilkyWayLabelEnabled,
  ],
  (structures, galaxyCatalogs, starCatalogs, bodies, blackHoles, milkyWayLabelEnabled) =>
    projectLabelCategoryVisibility({
      structures,
      galaxyCatalogs,
      starCatalogs,
      bodies,
      blackHoles,
      milkyWayLabelEnabled,
    }),
);

// A key, not createSelector inputs: the Layer values are one boolean per row, a variable-length input.
const rowsMemo = memoizeLastByKeys<readonly ToggleRow[]>();

export function selectToggleRows(
  state: RootState,
  layerRows: readonly LayerToggleRow[],
): readonly ToggleRow[] {
  const labelVisibility = selectLabelCategoryVisibility(state);
  const entries = layerRows.map(
    (row) => visibilityEntryOf(APP_VISIBILITY, row.toggle) as ShowEntry,
  );
  const layerValues = entries.map((entry) => visibilitySwitchOf(state.settings, entry));
  return rowsMemo.get([labelVisibility, layerRows, ...layerValues], () => [
    // The category's source type names its label home, and the home knows which action writes the bit.
    ...LABEL_CATEGORIES.map((cat) => ({
      id: `toggle-label-${cat}`,
      label: CATEGORY_DISPLAY_INFO[cat].plural,
      enabled: labelVisibility[cat],
      set: (enabled: boolean) =>
        LABEL_HOME_BY_SOURCE_TYPE[SOURCE_TYPE_BY_LABEL_CATEGORY[cat]].write(cat, enabled),
    })),
    ...layerRows.map((row, index) => ({
      id: `toggle-${row.toggle}`,
      label: row.label,
      enabled: layerValues[index]!,
      set: (on: boolean) =>
        setVisibility({ cluster: entries[index]!.cluster ?? row.toggle, field: 'enabled', on }),
    })),
  ]);
}
