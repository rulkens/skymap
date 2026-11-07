import type { BrowserWindow, Rectangle } from 'electron';
import { setFullScreen } from './utils/setFullScreen';

/** Full screen on the display with these bounds; also moves a window that already fills another. */
export function fillDisplay(win: BrowserWindow, bounds: Rectangle): void {
  setFullScreen(win, false);
  win.setBounds(bounds);
  setFullScreen(win, true);
}
