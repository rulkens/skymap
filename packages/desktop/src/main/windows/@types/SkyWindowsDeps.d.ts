import type { BrowserWindow } from 'electron';
import type { InstallSetup } from '../../../@types/InstallSetup';
import type { QuitGate } from './QuitGate';

/** What the sky window's keeper needs: the control window it places beside it, and the current setup. */
export type SkyWindowsDeps = {
  control: BrowserWindow;
  windowed: boolean;
  gate: QuitGate;
  setup: () => InstallSetup;
  onClosed: () => void;
};
