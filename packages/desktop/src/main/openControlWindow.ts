import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';

/**
 * The control window, hidden. Closing only hides it: the sky runs unattended, and the shortcut
 * (or a second launch) brings the window back; Quit in the page is the one way out.
 */
export function openControlWindow(): BrowserWindow {
  const win = new BrowserWindow({
    show: false,
    width: 960,
    height: 760,
    title: 'Skymap control',
    backgroundColor: '#000000',
    webPreferences: {
      preload: join(app.getAppPath(), 'build/control/preload.cjs'),
      sandbox: true,
      contextIsolation: true,
    },
  });
  let quitting = false;
  app.on('before-quit', () => (quitting = true));
  win.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    win.hide();
  });
  // The page is local and fixed; nothing may navigate it or open another window.
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  void win.loadFile(join(app.getAppPath(), 'build/control/index.html'));
  return win;
}
