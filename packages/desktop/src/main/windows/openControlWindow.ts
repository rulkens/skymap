import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import type { QuitGate } from './@types/QuitGate';

/**
 * The control window, hidden. Closing only hides it: the sky runs unattended, and the shortcut
 * (or a second launch) brings the window back; Quit in the page is the one way out.
 * On macOS the page is the whole window: the traffic lights float in a band above its header, sized
 * by the overlay's `titlebar-area-height` CSS variable. Windows keeps its own frame (dark
 * through nativeTheme), so the menu bar can hide behind Alt.
 */
export function openControlWindow(gate: QuitGate): BrowserWindow {
  const win = new BrowserWindow({
    show: false,
    width: 960,
    height: 760,
    minWidth: 800,
    minHeight: 640,
    center: true,
    title: 'Skymap — Control',
    backgroundColor: '#000000',
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hidden', titleBarOverlay: true, trafficLightPosition: { x: 24, y: 14 } }
      : { autoHideMenuBar: true }),
    webPreferences: {
      preload: join(app.getAppPath(), 'build/control/preload.cjs'),
      sandbox: true,
      contextIsolation: true,
    },
  });
  win.on('close', (event) => {
    if (gate.mayClose()) return;
    event.preventDefault();
    win.hide();
  });
  // The page is local and fixed; nothing may navigate it or open another window.
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  void win.loadFile(join(app.getAppPath(), 'build/control/index.html'));
  return win;
}
