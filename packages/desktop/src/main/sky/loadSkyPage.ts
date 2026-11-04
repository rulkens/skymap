import type { BrowserWindow } from 'electron';
import { setTimeout as delay } from 'node:timers/promises';
import { addOverlay } from './addOverlay';
import { CURTAIN_IN_MS } from './data/curtainInMs';
import { CURTAIN_OUT_MS } from './data/curtainOutMs';
import { READY_TIMEOUT_MS } from './data/readyTimeoutMs';
import { WHEN_READY } from './data/whenReady';

/**
 * Loads `url` into the sky window behind a black curtain that fades in over whatever is showing and
 * fades out once the app is ready, so a first start, a restart and a mode switch never pop.
 */
export async function loadSkyPage(win: BrowserWindow, url: string): Promise<void> {
  const curtain = addOverlay(win, 'sky-curtain.html', {}, CURTAIN_OUT_MS);
  try {
    await curtain.loaded;
    await delay(CURTAIN_IN_MS);
    await win.loadURL(url);
    await Promise.race([win.webContents.executeJavaScript(WHEN_READY), delay(READY_TIMEOUT_MS)]);
  } finally {
    await curtain.close();
  }
}
