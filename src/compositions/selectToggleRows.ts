/**
 * selectToggleRows — every Labels & Guides checkbox, in panel order: one row per label category
 * (`LABEL_CATEGORIES`, registry-code order), then each Layer row in composition order. Every row reads and writes
 * through its entry: a category through the label entry that lists it, a Layer row through the show entry it names.
 * Lives in `compositions/` because the Layer rows' entries come from `APP_VISIBILITY`.
 *
 * Referentially stable: an unrelated store write returns the same array, so the `memo` section behind it does not
 * re-render. Every row's value is a boolean key, never `state.settings` itself, which Immer re-identifies on every
 * write. The memo has one slot: every caller must pass the same `layerRows` array, or alternating calls rebuild the
 * rows each time.
 */
import { LABEL_CATEGORIES } from '../data/structure/labelCategories';
import { CATEGORY_DISPLAY_INFO } from '../data/structure/categoryDisplayInfo';
import { memoizeLastByKeys } from '../utils/cache/memoizeLastByKeys';
import { labelEntryFor } from '../utils/visibility/labelEntryFor';
import { visibilityEntryOf } from '../utils/visibility/visibilityEntryOf';
import { visibilityClusterOf } from '../utils/visibility/visibilityClusterOf';
import { visibilitySwitchOf } from '../utils/visibility/visibilitySwitchOf';
import { setVisibility } from '../state/settings/setVisibilityAction';
import { APP_VISIBILITY } from './appVisibility';
import type { ToggleRow } from '../@types/settings/ToggleRow';
import type { LayerToggleRow } from '../@types/engine/layer/LayerToggleRow';
import type { ShowEntry } from '../@types/engine/layer/ShowEntry';
import type { RootState } from '../store/types';

// A category's label entry, and the item it reads: none for an item-less entry (the Milky Way's).
const LABEL_ROWS = LABEL_CATEGORIES.map((cat) => {
  const entry = labelEntryFor(cat);
  return { cat, entry, item: entry.items === undefined ? undefined : cat };
});

// Keys, not createSelector inputs: the values are one boolean per row, a variable-length input.
const rowsMemo = memoizeLastByKeys<readonly ToggleRow[]>();

export function selectToggleRows(
  state: RootState,
  layerRows: readonly LayerToggleRow[],
): readonly ToggleRow[] {
  const labelValues = LABEL_ROWS.map(({ entry, item }) =>
    visibilitySwitchOf(state.settings, entry, item),
  );
  const entries = layerRows.map(
    (row) => visibilityEntryOf(APP_VISIBILITY, row.toggle) as ShowEntry,
  );
  const layerValues = entries.map((entry) => visibilitySwitchOf(state.settings, entry));
  return rowsMemo.get([layerRows, ...labelValues, ...layerValues], () => [
    ...LABEL_ROWS.map(({ cat, entry, item }, index) => ({
      id: `toggle-label-${cat}`,
      label: CATEGORY_DISPLAY_INFO[cat].plural,
      enabled: labelValues[index]!,
      set: (on: boolean) =>
        setVisibility({
          cluster: entry.cluster,
          ...(item !== undefined ? { item } : {}),
          field: 'labelEnabled',
          on,
        }),
    })),
    ...layerRows.map((row, index) => ({
      id: `toggle-${row.toggle}`,
      label: row.label,
      enabled: layerValues[index]!,
      set: (on: boolean) =>
        setVisibility({ cluster: visibilityClusterOf(entries[index]!), field: 'enabled', on }),
    })),
  ]);
}
