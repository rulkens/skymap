import type { InstallSetup } from '../../@types/InstallSetup';
import type { Settings } from '../settings/@types/Settings';
import type { SetupEffects } from './@types/SetupEffects';
import type { SetupStore } from './@types/SetupStore';
import { differs } from './utils/differs';

/**
 * The install's setup and its one writer. The app follows a change only once it is stored, and a
 * failed write changes nothing; the settings write is synchronous, so saves land in the order asked.
 */
export function createSetupStore(
  settings: Settings,
  initial: InstallSetup,
  effects: SetupEffects,
): SetupStore {
  let current = initial;
  const save = async (next: InstallSetup): Promise<void> => {
    settings.set('setup', next);
    const previous = current;
    current = next;
    if (differs(previous.display, next.display)) effects.placeWindows();
    if (differs(previous.dataUpdates, next.dataUpdates)) effects.rearmUpdates();
    if (previous.mode !== next.mode) effects.modeChanged();
    if (previous.network !== next.network) effects.networkChanged();
    if (previous.autostart !== next.autostart) effects.autostartChanged(next.autostart);
  };
  return { current: () => current, save };
}
