import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import type { Display } from 'electron';
import { fillDisplay } from './fillDisplay';
import { hideSkyChrome } from '../sky/hideSkyChrome';
import { superviseWindow } from './superviseWindow';

/**
 * Black and full screen on `display`, not yet holding the sky; `windowed` gives a normal window with
 * DevTools. A show's sky has no frame (owner ruling): its close button could only be refused, since
 * the sky closes with the app. Escape leaves a window that skyPreload's top-edge strip moves.
 * It shows on its first paint of a blank black page, so no frame is ever white.
 */
export function openSkyWindow(
  display: Display,
  windowed: boolean,
  mayClose: () => boolean,
): BrowserWindow {
  const { x, y } = display.bounds;
  const win = new BrowserWindow({
    show: false,
    title: 'Skymap',
    backgroundColor: '#000000',
    frame: windowed,
    webPreferences: { preload: join(app.getAppPath(), 'build/control/skyPreload.cjs') },
    ...(windowed ? { x: x + 40, y: y + 40, width: 1280, height: 720 } : display.bounds),
  });
  win.on('page-title-updated', (event) => event.preventDefault());
  win.once('ready-to-show', () => {
    win.show();
    if (!windowed) fillDisplay(win, display.bounds);
  });
  if (windowed) win.webContents.openDevTools({ mode: 'detach' });
  else {
    win.on('close', (event) => mayClose() || event.preventDefault());
    hideSkyChrome(win);
  }
  superviseWindow(win);
  // Not about:blank: under the dark native theme Chromium paints that a dark grey, not black.
  win.loadURL('data:text/html,<html style="background:%23000"></html>').catch(() => {});
  return win;
}
