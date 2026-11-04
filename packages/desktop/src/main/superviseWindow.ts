/**
 * Keeps an unattended window alive and on the app: a crashed renderer or GPU process reloads it,
 * a renderer hung for 30 s is killed (which then reloads it), and it can only ever show the app's
 * own server, so an InfoCard's outbound link is a dead click rather than a way out of the kiosk.
 */
import { app } from 'electron';
import type { BrowserWindow, Details } from 'electron';
import { isAppUrl } from '../utils/isAppUrl.js';

const RELOAD_DELAY_MS = 2000;
const UNRESPONSIVE_MS = 30_000;

export function superviseWindow(win: BrowserWindow): void {
  const contents = win.webContents;
  const reloadSoon = () =>
    setTimeout(() => {
      if (!win.isDestroyed()) contents.reload();
    }, RELOAD_DELAY_MS);

  contents.on('render-process-gone', (_event, details) => {
    if (details.reason !== 'clean-exit') reloadSoon();
  });
  const onChildGone = (_event: unknown, details: Details) => {
    if (details.type === 'GPU') reloadSoon();
  };
  app.on('child-process-gone', onChildGone);
  win.on('closed', () => app.off('child-process-gone', onChildGone));

  let hung: NodeJS.Timeout | undefined;
  win.on('unresponsive', () => {
    clearTimeout(hung);
    hung = setTimeout(() => {
      if (!win.isDestroyed()) contents.forcefullyCrashRenderer();
    }, UNRESPONSIVE_MS);
  });
  win.on('responsive', () => clearTimeout(hung));

  contents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault();
  });
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
}
