import type { ExhibitSwitch } from '../../@types/exhibits/ExhibitSwitch';
import type { EngineSettingsState } from '../../@types/settings/EngineSettingsState';
import { isVisibilityAddressOn } from '../visibility/isVisibilityAddressOn';

/** Every address on, so a partly shown switch reads off and its button offers "Show". */
export function isExhibitSwitchOn(
  settings: EngineSettingsState,
  { addresses }: ExhibitSwitch,
): boolean {
  return addresses.every((address) => isVisibilityAddressOn(settings, address));
}
