/**
 * selectToggleRows — every Labels & Guides checkbox, in panel order: one row per label category
 * (`LABEL_CATEGORIES`, registry-code order), the orbit-trails guide row, then each Layer row in composition order.
 * Lives in `compositions/` because it reads five Layers' label homes, which nothing under `state/` may import.
 *
 * Referentially stable: an unrelated store write returns the same array, so the `memo` section behind it does not
 * re-render. The label homes are per-cluster selector outputs, never `state.settings` itself, which Immer
 * re-identifies on every write.
 */
import { createSelector } from '@reduxjs/toolkit';
import { selectStructureItems } from '../layers/structure/state/structures/selectors';
import { selectGalaxyCatalogItems } from '../layers/galaxyCatalog/state/galaxyCatalogs/selectors';
import { selectStarCatalogItems } from '../layers/starCatalog/state/starCatalogs/selectors';
import { selectBodyItems } from '../layers/body/state/bodies/selectors';
import { selectBlackHoleItems } from '../layers/blackHoles/state/blackHoles/selectors';
import { selectMilkyWayLabelEnabled } from '../layers/milkyWay/state/milkyWay/selectors';
import { selectOrbitTrailsEnabled } from '../state/settings/core/orbitTrails/selectors';
import { setOrbitTrailsEnabled } from '../state/settings/core/orbitTrails/slice';
import { projectLabelCategoryVisibility } from '../state/settings/projectLabelCategoryVisibility';
import { LABEL_HOME_BY_SOURCE_TYPE } from '../data/labels/labelHomeBySourceType';
import { SOURCE_TYPE_BY_LABEL_CATEGORY } from '../data/labels/sourceTypeByLabelCategory';
import { LABEL_CATEGORIES } from '../data/structure/labelCategories';
import { CATEGORY_DISPLAY_INFO } from '../data/structure/categoryDisplayInfo';
import { memoizeLastByKeys } from '../utils/cache/memoizeLastByKeys';
import type { ToggleRow } from '../@types/settings/ToggleRow';
import type { LayerSettingsRow } from '../@types/engine/layer/LayerSettingsRow';
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
  layerRows: readonly LayerSettingsRow[],
): readonly ToggleRow[] {
  const labelVisibility = selectLabelCategoryVisibility(state);
  const orbitTrailsEnabled = selectOrbitTrailsEnabled(state);
  const layerValues = layerRows.map((row) => row.select(state));
  return rowsMemo.get([labelVisibility, orbitTrailsEnabled, layerRows, ...layerValues], () => [
    // The category's source type names its label home, and the home knows which action writes the bit.
    ...LABEL_CATEGORIES.map((cat) => ({
      id: `toggle-label-${cat}`,
      label: CATEGORY_DISPLAY_INFO[cat].plural,
      enabled: labelVisibility[cat],
      set: (enabled: boolean) =>
        LABEL_HOME_BY_SOURCE_TYPE[SOURCE_TYPE_BY_LABEL_CATEGORY[cat]].write(cat, enabled),
    })),
    // Hand-authored: orbit trails gate line geometry, not labels, so no registry row derives it.
    {
      id: 'toggle-orbit-trails',
      label: 'Orbit trails',
      enabled: orbitTrailsEnabled,
      set: setOrbitTrailsEnabled,
    },
    ...layerRows.map((row, index) => ({
      id: row.id,
      label: row.label,
      enabled: layerValues[index]!,
      set: row.set,
    })),
  ]);
}
