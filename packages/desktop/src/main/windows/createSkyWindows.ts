import { screen } from 'electron';
import type { BrowserWindow, Display, Rectangle } from 'electron';
import type { DisplayInfo } from '../../@types/DisplayInfo';
import type { Overlay } from '../sky/@types/Overlay';
import type { SkyWindows } from './@types/SkyWindows';
import type { SkyWindowsDeps } from './@types/SkyWindowsDeps';
import { fillDisplay } from './fillDisplay';
import { isFullScreenKey } from './utils/isFullScreenKey';
import { listDisplays } from './utils/listDisplays';
import { openSkyWindow } from './openSkyWindow';
import { placeWindows } from './utils/placeWindows';
import { setFullScreen as setFull } from './utils/setFullScreen';
import { showTestGrid } from '../sky/showTestGrid';

/**
 * Keeps the one sky window on the display placeWindows picks, with the control window on another
 * (or floating above the sky on a single screen), and holds the test grid laid over it. A sky taken
 * out of full screen stays a window until put back: display changes leave it where it is.
 */
export function createSkyWindows(deps: SkyWindowsDeps): SkyWindows {
  const { control, windowed, mayClose, setup, onClosed, onFullScreen } = deps;
  let sky: BrowserWindow | null = null;
  let full = !windowed;
  let grid: Overlay | null = null;
  const current = (): BrowserWindow | null => (sky !== null && !sky.isDestroyed() ? sky : null);
  // The list can change between two reads, so the primary stands in for a display just removed.
  const displayOf = (info: DisplayInfo): Display =>
    screen.getAllDisplays().find((d) => d.id === info.id) ?? screen.getPrimaryDisplay();
  const fills = (win: BrowserWindow, b: Rectangle): boolean => {
    const a = win.getBounds();
    return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
  };

  const place = (): ReturnType<SkyWindows['place']> => {
    const placement = placeWindows(setup().display, listDisplays());
    if (placement === null) return null;
    const open = current();
    const bounds = displayOf(placement.sky).bounds;
    // A work-area change also lands here; refilling a sky already in place makes it jump.
    if (open && full && !fills(open, bounds)) fillDisplay(open, bounds);
    control.setAlwaysOnTop(placement.control === null && full, 'screen-saver');
    // Moved only when it is not on its display: a window the operator placed stays where it is.
    const home = displayOf(placement.control ?? placement.sky);
    if (screen.getDisplayMatching(control.getBounds()).id !== home.id) {
      const { x, y, width, height } = home.workArea;
      const [w = 0, h = 0] = control.getSize();
      control.setPosition(Math.round(x + (width - w) / 2), Math.round(y + (height - h) / 2));
    }
    return placement;
  };

  const open = (): BrowserWindow => {
    const existing = current();
    if (existing) return existing;
    const at = placeWindows(setup().display, listDisplays())?.sky;
    const win = openSkyWindow(at ? displayOf(at) : screen.getPrimaryDisplay(), windowed, mayClose);
    win.on('closed', onClosed);
    win.webContents.on('before-input-event', (event, input) => {
      if (windowed || !isFullScreenKey(input, process.platform)) return;
      event.preventDefault();
      setFullScreen(!full);
    });
    full = !windowed;
    // A new sky starts full screen, whatever the last one was left as.
    onFullScreen(full);
    return (sky = win);
  };

  const setFullScreen = (on: boolean): boolean => {
    const win = current();
    if (windowed || win === null || on === full) return full;
    full = on;
    // Back in: place() fills the sky's display, as for any sky not filling it.
    if (!on) {
      setFull(win, false);
      const { x, y, width, height } = screen.getDisplayMatching(win.getBounds()).workArea;
      win.setBounds({
        x: Math.round(x + width * 0.125),
        y: Math.round(y + height * 0.125),
        width: Math.round(width * 0.75),
        height: Math.round(height * 0.75),
      });
    }
    place();
    onFullScreen(full);
    return full;
  };

  const setTestGrid = (on: boolean): boolean => {
    void grid?.close().catch(() => {});
    grid = null;
    if (!on) return false;
    const win = open();
    const shownOn = screen.getDisplayMatching(win.getBounds()).id;
    const number = listDisplays().find((d) => d.id === shownOn)?.number ?? 1;
    grid = showTestGrid(win, setup().mode, number);
    return true;
  };

  return { place, open, current, setTestGrid, setFullScreen };
}
