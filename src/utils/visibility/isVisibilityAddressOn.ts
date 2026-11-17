import type { ScopedVisibilityAddress } from '../../@types/animation/ScopedVisibilityAddress';
import type { VisibilityAddress } from '../../@types/animation/VisibilityAddress';
import type { EngineSettingsState } from '../../@types/settings/EngineSettingsState';
import { APP_VISIBILITY_REGISTRY } from '../../compositions/appVisibility';
import { isShowEntryOn } from './isShowEntryOn';
import { splitVisibilityAddress } from './splitVisibilityAddress';
import { visibilityEntryOf } from './visibilityEntryOf';
import { visibilitySwitchOf } from './visibilitySwitchOf';

/** Whether one address reads as on: the read side of `setVisibilityActionsFor`, so a switch
 * built on the pair flips from every state. A scoped address reads its one item; a bare one
 * reads like its write lands (a label's items written together read on when any is). */
export function isVisibilityAddressOn(
  settings: EngineSettingsState,
  address: VisibilityAddress | ScopedVisibilityAddress,
): boolean {
  const { bare, item } = splitVisibilityAddress(address);
  const entry = visibilityEntryOf(APP_VISIBILITY_REGISTRY, bare as VisibilityAddress);
  if (item !== undefined) return visibilitySwitchOf(settings, entry, item);
  if ('key' in entry) return isShowEntryOn(settings, entry);
  if (entry.items === undefined) return visibilitySwitchOf(settings, entry);
  return entry.items.some((i) => visibilitySwitchOf(settings, entry, i));
}
