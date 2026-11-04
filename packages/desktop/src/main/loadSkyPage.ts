import type { BrowserWindow } from 'electron';
import { setTimeout as delay } from 'node:timers/promises';
import { addOverlay } from './addOverlay';

// sky-curtain.html's fade in and out.
const CURTAIN_IN_MS = 300;
const CURTAIN_OUT_MS = 500;
// A sky that never reports ready (no WebGPU, say) still shows, so its own message can be read.
const READY_TIMEOUT_MS = 10_000;
// window.__skymap is the app's automation hook (src/state/automation/installSkymapHook.ts), installed on
// every load; `ready` resolves once the first scene has settled.
const WHEN_READY = `new Promise((done) => {
  const poll = () => (window.__skymap ? window.__skymap.ready.then(done, done) : setTimeout(poll, 100));
  poll();
})`;

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
