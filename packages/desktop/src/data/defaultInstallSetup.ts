import type { InstallSetup } from '../@types/InstallSetup';

/** A fresh install: the flat view on the primary display, syncing at every launch. */
export const DEFAULT_INSTALL_SETUP: InstallSetup = {
  mode: 'kiosk',
  display: null,
  network: null,
  autostart: false,
  dataUpdates: { kind: 'atLaunch' },
};
