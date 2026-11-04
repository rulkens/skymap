import { BrowserWindow } from 'electron';
import type { Display } from 'electron';
import type { InstallSetup } from '../@types/InstallSetup.js';
import { skyUrlFor } from '../utils/skyUrlFor.js';
import { fillDisplay } from './fillDisplay.js';
import { superviseWindow } from './superviseWindow.js';

/** Frameless, black and full screen on `display`; `windowed` gives a normal window with DevTools. */
export function openSkyWindow(
  display: Display,
  mode: InstallSetup['mode'],
  windowed: boolean,
): BrowserWindow {
  const { x, y } = display.bounds;
  const win = new BrowserWindow(
    windowed
      ? { x: x + 40, y: y + 40, width: 1280, height: 720, backgroundColor: '#000000' }
      : { ...display.bounds, frame: false, backgroundColor: '#000000' },
  );
  if (windowed) win.webContents.openDevTools({ mode: 'detach' });
  else fillDisplay(win, display.bounds);
  superviseWindow(win);
  void win.loadURL(skyUrlFor(mode));
  return win;
}
