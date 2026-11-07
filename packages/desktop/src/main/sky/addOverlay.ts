import { app, WebContentsView } from 'electron';
import type { BrowserWindow } from 'electron';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { Overlay } from './@types/Overlay';

/**
 * Lays `assets/<page>` over all of `win` as a child view, so it moves with the window and only its size
 * needs following. `close` sets the page's opacity to 0 and waits `fadeMs` for the page's own
 * transition (which carries its reduced-motion branch) before removing the view; the page reads
 * that duration from its `fadeOut` query, so the time has one home.
 */
export function addOverlay(
  win: BrowserWindow,
  page: string,
  query: Record<string, string>,
  fadeMs: number,
): Overlay {
  // Chromium can count a child view as hidden; unthrottled, its fade still runs on time.
  const view = new WebContentsView({ webPreferences: { backgroundThrottling: false } });
  view.setBackgroundColor('#00000000');
  const fit = () => {
    const { width, height } = win.getContentBounds();
    view.setBounds({ x: 0, y: 0, width, height });
  };
  fit();
  win.on('resize', fit);
  win.contentView.addChildView(view);
  const loaded = view.webContents.loadFile(join(app.getAppPath(), 'assets', page), {
    query: { ...query, fadeOut: String(fadeMs) },
  });
  const close = async (): Promise<void> => {
    win.off('resize', fit);
    if (!win.isDestroyed()) {
      await view.webContents.insertCSS('html { opacity: 0; }').catch(() => {});
      await delay(fadeMs);
    }
    if (!win.isDestroyed()) win.contentView.removeChildView(view);
    view.webContents.close();
  };
  return { loaded, close };
}
