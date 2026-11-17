/**
 * selectLayerSwitchRows — the remote's Layers sheet as data: one switch per row of
 * `APP_LAYER_SWITCH_ROWS`, reading and writing its whole show entry as a tour cue on that key
 * does. No memo: only the remote receiver reads it, once per status and per command.
 */
import { APP_VISIBILITY_REGISTRY } from '../../compositions/appVisibility';
import { isShowEntryOn } from '../../utils/visibility/isShowEntryOn';
import { setVisibilityActionsFor } from '../../utils/visibility/setVisibilityActionsFor';
import { visibilityEntryOf } from '../../utils/visibility/visibilityEntryOf';
import type { LayerToggleRow } from '../../@types/engine/layer/LayerToggleRow';
import type { ShowEntry } from '../../@types/engine/layer/ShowEntry';
import type { ToggleRow } from '../../@types/settings/ToggleRow';
import type { RootState } from '../../store/types';

export function selectLayerSwitchRows(
  { settings }: RootState,
  rows: readonly LayerToggleRow[],
): readonly ToggleRow[] {
  return rows.map(({ toggle, label }) => ({
    id: toggle,
    label,
    enabled: isShowEntryOn(
      settings,
      visibilityEntryOf(APP_VISIBILITY_REGISTRY, toggle) as ShowEntry,
    ),
    set: (on: boolean) => setVisibilityActionsFor(settings, toggle, on),
  }));
}
