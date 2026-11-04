import { screen } from 'electron';
import type { BrowserWindow } from 'electron';
import type { InstallSetup } from '../../@types/InstallSetup';
import type { Overlay } from './@types/Overlay';
import { addOverlay } from './addOverlay';
import { TEST_GRID_FADE_MS } from './data/testGridFadeMs';

/** Lays the dome grid (dome) or the display's number (kiosk) over the sky window; closing it fades it away. */
export function showTestGrid(sky: BrowserWindow, mode: InstallSetup['mode']): Overlay {
  const displayId = screen.getDisplayMatching(sky.getBounds()).id;
  const display = screen.getAllDisplays().findIndex((d) => d.id === displayId) + 1;
  const grid = addOverlay(
    sky,
    'test-grid.html',
    { mode, display: String(display) },
    TEST_GRID_FADE_MS,
  );
  grid.loaded.catch(() => {});
  return grid;
}
