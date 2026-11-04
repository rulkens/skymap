import type { BrowserWindow } from 'electron';
import { SKY_PAGE_CSS } from '../data/skyPageCss';
import { createIdleTimer } from '../utils/createIdleTimer';

const CURSOR_IDLE_MS = 3000;
const NO_CURSOR = '* { cursor: none !important; }';

/**
 * Keeps a show's sky window a picture: SKY_PAGE_CSS on every page it loads, and the cursor hidden after
 * a few still seconds until the mouse moves. Electron shows no context menu unless asked, so none is.
 */
export function hideSkyChrome(win: BrowserWindow): void {
  const contents = win.webContents;
  // A navigation drops inserted CSS, so the key of the last hide is only good until then.
  let hidden: Promise<string> | null = null;
  const cursor = createIdleTimer(
    CURSOR_IDLE_MS,
    () => void (hidden = contents.insertCSS(NO_CURSOR)),
    () => {
      void hidden?.then((key) => contents.removeInsertedCSS(key)).catch(() => {});
      hidden = null;
    },
  );
  contents.on('dom-ready', () => {
    void contents.insertCSS(SKY_PAGE_CSS);
    hidden = null;
    cursor.poke();
  });
  contents.on('input-event', (_event, input) => {
    if (input.type === 'mouseMove') cursor.poke();
  });
  win.on('closed', cursor.stop);
}
