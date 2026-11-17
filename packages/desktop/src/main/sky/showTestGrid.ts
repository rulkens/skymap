import type { BrowserWindow } from 'electron';
import type { InstallMode } from '../../@types/InstallMode';
import type { Overlay } from './@types/Overlay';
import { addOverlay } from './addOverlay';
import { TEST_GRID_FADE_MS } from './data/testGridFadeMs';

/** Lays the dome grid (dome) or the display's number (kiosk) over the sky window; closing it fades it away. */
export function showTestGrid(sky: BrowserWindow, mode: InstallMode, display: number): Overlay {
  const grid = addOverlay(
    sky,
    'test-grid.html',
    { mode, display: String(display) },
    TEST_GRID_FADE_MS,
  );
  grid.loaded.catch(() => {});
  return grid;
}
