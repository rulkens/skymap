import type { ShowEntry } from '../../@types/engine/layer/ShowEntry';
import type { EngineSettingsState } from '../../@types/settings/EngineSettingsState';
import { hasSectionSwitch } from './hasSectionSwitch';
import { visibilityClusterOf } from './visibilityClusterOf';
import { visibilitySwitchOf } from './visibilitySwitchOf';

/** Whether a whole show entry reads as on: its section switch where it has one, else any item's.
 * The read side of `setVisibilityActionsFor`'s bare-address write, so a switch built on the two
 * flips from every state, a mixed one included, as the settings panel's tri-state masters do. */
export function isShowEntryOn(settings: EngineSettingsState, entry: ShowEntry): boolean {
  if (entry.items === undefined || hasSectionSwitch(settings, visibilityClusterOf(entry))) {
    return visibilitySwitchOf(settings, entry);
  }
  return entry.items.some((item) => visibilitySwitchOf(settings, entry, item));
}
