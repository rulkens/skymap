import type { BrowserWindow } from 'electron';
import type { InstallSetup } from '../../../@types/InstallSetup';

/** What the sky window's keeper needs: the control window it places beside it, and the current setup. */
export type SkyWindowsDeps = {
  control: BrowserWindow;
  windowed: boolean;
  /** True once the app is quitting; until then the sky window refuses to close. */
  mayClose: () => boolean;
  setup: () => InstallSetup;
  onClosed: () => void;
};
