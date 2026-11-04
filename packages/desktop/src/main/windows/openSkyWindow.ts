import { BrowserWindow } from 'electron';
import type { Display } from 'electron';
import type { QuitGate } from './@types/QuitGate';
import { fillDisplay } from './fillDisplay';
import { hideSkyChrome } from '../sky/hideSkyChrome';
import { superviseWindow } from './superviseWindow';

/**
 * Frameless, black and full screen on `display`, not yet holding the sky; `windowed` gives a normal
 * window with DevTools. It shows on its first paint of a blank black page, so no frame is ever white.
 */
export function openSkyWindow(display: Display, windowed: boolean, gate: QuitGate): BrowserWindow {
  const { x, y } = display.bounds;
  const win = new BrowserWindow({
    show: false,
    title: 'Skymap',
    backgroundColor: '#000000',
    ...(windowed
      ? { x: x + 40, y: y + 40, width: 1280, height: 720 }
      : { ...display.bounds, frame: false }),
  });
  win.on('page-title-updated', (event) => event.preventDefault());
  win.once('ready-to-show', () => {
    win.show();
    if (!windowed) fillDisplay(win, display.bounds);
  });
  if (windowed) win.webContents.openDevTools({ mode: 'detach' });
  else {
    win.on('close', (event) => gate.mayClose() || event.preventDefault());
    hideSkyChrome(win);
  }
  superviseWindow(win);
  // Not about:blank: under the dark native theme Chromium paints that a dark grey, not black.
  win.loadURL('data:text/html,<html style="background:%23000"></html>').catch(() => {});
  return win;
}
