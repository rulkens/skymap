import type { BrowserWindow } from 'electron';
import type { WindowPlacement } from '../../../@types/WindowPlacement';

/** The sky window and what lies on it (createSkyWindows). */
export type SkyWindows = {
  /** Fits the sky to its display and the control window beside it; null while no display is reported. */
  place: () => WindowPlacement | null;
  /** The sky window, opened black on the sky's display when there is none. */
  open: () => BrowserWindow;
  current: () => BrowserWindow | null;
  /** Lays or lifts the test grid; true when it now lies on the sky. */
  setTestGrid: (on: boolean) => boolean;
  /** Fills the sky's display, or leaves it a movable window on it; true when it now fills it. */
  setFullScreen: (on: boolean) => boolean;
};
