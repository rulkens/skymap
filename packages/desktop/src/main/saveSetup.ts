import { app } from 'electron';
import { join } from 'node:path';
import type { InstallSetup } from '../@types/InstallSetup';
import type { SetupEffects } from '../@types/SetupEffects';
import { SETUP_FILE } from '../data/setupFile';
import { writeFileAtomically } from '../utils/writeFileAtomically';

const differs = (a: unknown, b: unknown): boolean => JSON.stringify(a) !== JSON.stringify(b);

/** Stores `setup` and applies what changed against `previous` live. */
export async function saveSetup(
  userData: string,
  previous: InstallSetup,
  setup: InstallSetup,
  effects: SetupEffects,
): Promise<void> {
  await writeFileAtomically(join(userData, SETUP_FILE), JSON.stringify(setup, null, 2));
  app.setLoginItemSettings({ openAtLogin: setup.autostart });
  if (differs(previous.display, setup.display)) effects.placeWindows();
  if (differs(previous.dataUpdates, setup.dataUpdates)) effects.rearmUpdates();
  if (previous.mode !== setup.mode) effects.reloadSky();
  if (previous.network !== setup.network) effects.resendRoom();
}
