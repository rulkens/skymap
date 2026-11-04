import { app, screen, WebContentsView } from 'electron';
import type { BrowserWindow } from 'electron';
import { join } from 'node:path';
import type { InstallSetup } from '../@types/InstallSetup';

// A child view of the sky window, so it moves with it; only its size needs following.
const shown = new WeakMap<BrowserWindow, { view: WebContentsView; fit: () => void }>();

/** Lays the dome grid (dome) or the display's number (kiosk) over the sky window, or removes it. */
export function showTestGrid(sky: BrowserWindow, mode: InstallSetup['mode'], on: boolean): void {
  const current = shown.get(sky);
  if (current !== undefined) {
    sky.off('resize', current.fit);
    sky.contentView.removeChildView(current.view);
    current.view.webContents.close();
    shown.delete(sky);
  }
  if (!on || sky.isDestroyed()) return;
  const view = new WebContentsView();
  view.setBackgroundColor('#00000000');
  const fit = () => {
    const { width, height } = sky.getContentBounds();
    view.setBounds({ x: 0, y: 0, width, height });
  };
  fit();
  sky.on('resize', fit);
  sky.contentView.addChildView(view);
  shown.set(sky, { view, fit });
  const displayId = screen.getDisplayMatching(sky.getBounds()).id;
  const display = screen.getAllDisplays().findIndex((d) => d.id === displayId) + 1;
  void view.webContents.loadFile(join(app.getAppPath(), 'assets', 'test-grid.html'), {
    query: { mode, display: String(display) },
  });
}
