import { screen } from 'electron';
import type { BrowserWindow, Display } from 'electron';
import type { DisplayInfo } from '../../@types/DisplayInfo';
import type { Overlay } from '../sky/@types/Overlay';
import type { SkyWindows } from './@types/SkyWindows';
import type { SkyWindowsDeps } from './@types/SkyWindowsDeps';
import { fillDisplay } from './fillDisplay';
import { listDisplays } from './utils/listDisplays';
import { openSkyWindow } from './openSkyWindow';
import { placeWindows } from './utils/placeWindows';
import { showTestGrid } from '../sky/showTestGrid';

/**
 * Keeps the one sky window on the display placeWindows picks, with the control window on another
 * (or floating above the sky on a single screen), and holds the test grid laid over it.
 */
export function createSkyWindows(deps: SkyWindowsDeps): SkyWindows {
  const { control, windowed, mayClose, setup, onClosed } = deps;
  let sky: BrowserWindow | null = null;
  let grid: Overlay | null = null;
  const current = (): BrowserWindow | null => (sky !== null && !sky.isDestroyed() ? sky : null);
  // The list can change between two reads, so the primary stands in for a display just removed.
  const displayOf = (info: DisplayInfo): Display =>
    screen.getAllDisplays().find((d) => d.id === info.id) ?? screen.getPrimaryDisplay();

  const place = (): ReturnType<SkyWindows['place']> => {
    const placement = placeWindows(setup().display, listDisplays());
    if (placement === null) return null;
    const open = current();
    if (open && !windowed) fillDisplay(open, displayOf(placement.sky).bounds);
    control.setAlwaysOnTop(placement.control === null && !windowed, 'screen-saver');
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
    return (sky = win);
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

  return { place, open, current, setTestGrid };
}
