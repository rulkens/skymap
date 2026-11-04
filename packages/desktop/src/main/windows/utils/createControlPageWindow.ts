import { app, BrowserWindow } from 'electron';
import type { BrowserWindowConstructorOptions } from 'electron';
import { join } from 'node:path';

/**
 * A window holding the control page (`search` picks its view), sandboxed behind the preload. The page
 * is local and fixed: nothing may navigate it or open another window.
 */
export function createControlPageWindow(
  options: BrowserWindowConstructorOptions,
  search?: string,
): BrowserWindow {
  const win = new BrowserWindow({
    ...options,
    webPreferences: {
      preload: join(app.getAppPath(), 'build/control/preload.cjs'),
      sandbox: true,
      contextIsolation: true,
    },
  });
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  void win.loadFile(join(app.getAppPath(), 'build/control/index.html'), search ? { search } : {});
  return win;
}
