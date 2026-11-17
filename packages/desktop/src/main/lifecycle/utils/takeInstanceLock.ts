import { app } from 'electron';
import { setTimeout as delay } from 'node:timers/promises';

/**
 * The single-instance lock, sending this build's time along. A running older build quits when it
 * hears of a newer one (runLifecycle), so a refused launch asks again for a while before giving up;
 * a running newer or equal build just shows its control window, and this launch ends.
 */
export async function takeInstanceLock(builtAt: string): Promise<boolean> {
  // About 10 s: long enough for the old build to close its windows and release the lock.
  for (let tries = 0; tries < 20; tries++) {
    if (app.requestSingleInstanceLock({ builtAt })) return true;
    await delay(500);
  }
  return false;
}
