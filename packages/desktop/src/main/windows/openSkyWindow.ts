import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import type { BrowserWindowConstructorOptions, Display, Rectangle } from 'electron';
import { fillDisplay } from './fillDisplay';
import { hideSkyChrome } from '../sky/hideSkyChrome';
import { superviseWindow } from './superviseWindow';

/**
 * Black and full screen on `display`, not yet holding the sky; `windowed` gives a normal window with
 * DevTools. A show's sky has no title bar, only the window buttons over the page (createSkyWindows
 * hides them in full screen and decides what they do); skyPreload's top-edge strip moves it. Not
 * fullscreenable, so the green button zooms instead of starting macOS's own full screen. `asWindow`
 * opens a show's sky as a window at those bounds instead, as it was left.
 * It shows on its first paint of a blank black page, so no frame is ever white.
 */
export function openSkyWindow(
  display: Display,
  windowed: boolean,
  asWindow: Rectangle | null,
): BrowserWindow {
  const { x, y } = display.bounds;
  const show: BrowserWindowConstructorOptions = {
    ...(asWindow ?? display.bounds),
    titleBarStyle: 'hidden',
    fullscreenable: false,
    ...(process.platform === 'win32'
      ? { titleBarOverlay: { color: '#000000', symbolColor: '#e8eeff', height: 28 } }
      : {}),
  };
  const win = new BrowserWindow({
    show: false,
    title: 'Skymap',
    backgroundColor: '#000000',
    webPreferences: { preload: join(app.getAppPath(), 'build/control/skyPreload.cjs') },
    ...(windowed ? { x: x + 40, y: y + 40, width: 1280, height: 720 } : show),
  });
  win.on('page-title-updated', (event) => event.preventDefault());
  win.once('ready-to-show', () => {
    win.show();
    if (!windowed && asWindow === null) fillDisplay(win, display.bounds);
  });
  if (windowed) win.webContents.openDevTools({ mode: 'detach' });
  else hideSkyChrome(win);
  superviseWindow(win);
  // Not about:blank: under the dark native theme Chromium paints that a dark grey, not black.
  win.loadURL('data:text/html,<html style="background:%23000"></html>').catch(() => {});
  return win;
}
