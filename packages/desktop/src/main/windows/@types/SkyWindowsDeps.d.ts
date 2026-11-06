import type { BrowserWindow } from 'electron';
import type { InstallSetup } from '../../../@types/InstallSetup';
import type { SkyWindowState } from './SkyWindowState';

/** What the sky window's keeper needs: the control window it places beside it, and the current setup. */
export type SkyWindowsDeps = {
  control: BrowserWindow;
  windowed: boolean;
  /** True once the app is quitting; until then the sky window refuses to close. */
  mayClose: () => boolean;
  setup: () => InstallSetup;
  onClosed: () => void;
  /** Each change of full screen, from the keys or setFullScreen, so the menu's tick follows. */
  onFullScreen: (full: boolean) => void;
  /** How the sky was left at the last run, and where to store each change of it. */
  left: SkyWindowState;
  remember: (state: SkyWindowState) => void;
};
