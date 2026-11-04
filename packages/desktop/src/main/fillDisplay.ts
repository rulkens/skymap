import type { BrowserWindow, Rectangle } from 'electron';

/** Full screen on the display with these bounds; also moves a window that already fills another. */
export function fillDisplay(win: BrowserWindow, bounds: Rectangle): void {
  // macOS's native full screen animates into a Space of its own; the simple kind is instant.
  const setFull = (on: boolean) =>
    process.platform === 'darwin' ? win.setSimpleFullScreen(on) : win.setFullScreen(on);
  setFull(false);
  win.setBounds(bounds);
  setFull(true);
}
