import type { BrowserWindow } from 'electron';

/**
 * Shows or hides the sky's window buttons: macOS draws its traffic lights over the page even in simple
 * full screen, so they are hidden there. Windows hides its title-bar overlay in full screen itself.
 */
export function showWindowButtons(win: BrowserWindow, on: boolean): void {
  if (process.platform === 'darwin') win.setWindowButtonVisibility(on);
}
