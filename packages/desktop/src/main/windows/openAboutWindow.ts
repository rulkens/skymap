import type { BrowserWindow } from 'electron';
import { createControlPageWindow } from './utils/createControlPageWindow';

/**
 * About as a small window of its own on both platforms: the control page alone with `?view=about`,
 * which draws the website's wordmark and the data's date, where macOS's native panel could show
 * neither. A child of the control window, so it stays above it when that floats over the sky.
 */
export function openAboutWindow(parent: BrowserWindow): BrowserWindow {
  const win = createControlPageWindow(
    {
      parent,
      show: false,
      width: 600,
      height: 660,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      title: 'About Skymap',
      backgroundColor: '#000000',
      ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' } : {}),
    },
    'view=about',
  );
  win.removeMenu();
  win.on('page-title-updated', (event) => event.preventDefault());
  win.once('ready-to-show', () => win.show());
  return win;
}
