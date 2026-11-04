import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';

/**
 * About as a small window of its own on both platforms: the control page alone with `?view=about`,
 * which draws the website's wordmark and the data's date, where macOS's native panel could show
 * neither. A child of the control window, so it stays above it when that floats over the sky.
 */
export function openAboutWindow(parent: BrowserWindow): BrowserWindow {
  const win = new BrowserWindow({
    parent,
    show: false,
    width: 560,
    height: 500,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'About Skymap',
    backgroundColor: '#000000',
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' } : {}),
    webPreferences: {
      preload: join(app.getAppPath(), 'build/control/preload.cjs'),
      sandbox: true,
      contextIsolation: true,
    },
  });
  win.removeMenu();
  win.on('page-title-updated', (event) => event.preventDefault());
  win.once('ready-to-show', () => win.show());
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  void win.loadFile(join(app.getAppPath(), 'build/control/index.html'), { search: 'view=about' });
  return win;
}
