/**
 * The switches that take `baseline` to `settings`, in `APP_VISIBILITY_REGISTRY` order. Reads
 * the RAW stored switches, not `visibilitySwitchOf`: that ANDs the section switch in, so one
 * section difference would come out as one per item. The cluster-level switch is compared
 * where `setVisibilityActionsFor` writes one for a bare address (no items, or a show entry's
 * section switch), so each emitted switch replays as exactly the write it stands for.
 */

import type { ScopedVisibilityAddress } from '../../@types/animation/ScopedVisibilityAddress';
import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';
import type { EngineSettingsState } from '../../@types/settings/EngineSettingsState';
import type { LayerSwitch } from '../../@types/url/LayerSwitch';
import { APP_VISIBILITY_REGISTRY } from '../../compositions/appVisibility';
import { hasSectionSwitch } from '../visibility/hasSectionSwitch';
import { settingsClusterOf } from '../visibility/settingsClusterOf';
import { visibilityAddressOf } from '../visibility/visibilityAddressOf';
import { visibilityClusterOf } from '../visibility/visibilityClusterOf';

const ENTRIES: readonly VisibilityEntry[] = APP_VISIBILITY_REGISTRY;

export function layerSwitchesFrom(
  settings: EngineSettingsState,
  baseline: EngineSettingsState,
): readonly LayerSwitch[] {
  const switches: LayerSwitch[] = [];
  for (const entry of ENTRIES) {
    const address = visibilityAddressOf(entry);
    const name = visibilityClusterOf(entry);
    const isShow = 'key' in entry;
    const field = isShow ? 'enabled' : 'labelEnabled';
    const current = settingsClusterOf(settings, name);
    const base = settingsClusterOf(baseline, name);
    if (entry.items === undefined || (isShow && hasSectionSwitch(settings, name))) {
      if (current[field] !== base[field]) switches.push({ address, on: current[field] === true });
    }
    for (const item of entry.items ?? []) {
      const own = current.items?.[item]?.[field];
      if (own === base.items?.[item]?.[field]) continue;
      switches.push({
        address: `${address}:${item}` as ScopedVisibilityAddress,
        on: own === true,
      });
    }
  }
  return switches;
}
