import { join } from 'node:path';
import type { InstallSetup } from '../../@types/InstallSetup';
import type { SetupEffects } from './@types/SetupEffects';
import type { SetupStore } from './@types/SetupStore';
import { SETUP_FILE } from './data/setupFile';
import { differs } from './utils/differs';
import { serially } from '../lifecycle/utils/serially';
import { writeFileAtomically } from '../files/utils/writeFileAtomically';

/**
 * The install's setup and setup.json's one writer. Saves run one at a time, so the last one asked
 * is the one on disk; the app follows a change only once it is stored, and a failed write changes nothing.
 */
export function createSetupStore(
  userData: string,
  initial: InstallSetup,
  effects: SetupEffects,
): SetupStore {
  let current = initial;
  const queue = serially();
  const save = (next: InstallSetup): Promise<void> =>
    queue(async () => {
      await writeFileAtomically(join(userData, SETUP_FILE), JSON.stringify(next, null, 2));
      const previous = current;
      current = next;
      if (differs(previous.display, next.display)) effects.placeWindows();
      if (differs(previous.dataUpdates, next.dataUpdates)) effects.rearmUpdates();
      if (previous.mode !== next.mode) effects.modeChanged();
      if (previous.network !== next.network) effects.networkChanged();
      if (previous.autostart !== next.autostart) effects.autostartChanged(next.autostart);
    });
  return { current: () => current, save };
}
