import type { BrowserWindow } from 'electron';

/** In or out of full screen; macOS's native kind animates into a Space of its own, the simple kind is instant. */
export function setFullScreen(win: BrowserWindow, on: boolean): void {
  if (process.platform === 'darwin') win.setSimpleFullScreen(on);
  else win.setFullScreen(on);
}
