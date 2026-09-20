/**
 * captureScene — one framed shot of the running scene, start to written file.
 * Order matters: declutter → settle → pose (landmine: a focus fly-in overwrites
 * an early `setPose`) → clear focus → verify → screenshot.
 */
import type { Browser } from '@playwright/test';
import { bootHookedPage } from '../browser/bootHookedPage';
import { collectPageErrors } from '../browser/collectPageErrors';
import { dispatchActions } from '../browser/dispatchActions';
import { waitSettled } from '../browser/waitSettled';
import { applyPose } from '../browser/applyPose';
import { readLiveCameraState } from '../browser/readLiveCameraState';
import { declutterActions } from './declutterActions';
import { poseMismatch } from './poseMismatch';
import { shotPose } from './shotPose';
import { writeThumbnail } from './writeThumbnail';
import { POST_ESC_WAIT_MS, VIEWPORT } from './shotDefaults';
import type { SceneShot } from './SceneShot';
import type { ShotOutcome } from './ShotOutcome';

export async function captureScene(
  browser: Browser,
  base: string,
  shot: SceneShot,
): Promise<ShotOutcome> {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const pageErrors = collectPageErrors(page);
  try {
    const pose = shotPose(shot);
    await bootHookedPage(
      page,
      `${base}/?perf&cinema#focus=${shot.focusId}&t=${shot.t}`,
      '__skymapPerf',
    );

    await dispatchActions(page, declutterActions(shot.hideGalaxyField === true));
    await waitSettled(page, shot.label);

    if (pose !== undefined) {
      await applyPose(page, pose);
      await waitSettled(page, shot.label);
    }

    if (shot.keepFocus !== true) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(POST_ESC_WAIT_MS);
    }

    if (pose !== undefined) {
      // Clearing the focus re-settles the camera off the pose, so it is applied
      // again and re-read rather than trusted.
      let live = await readLiveCameraState(page);
      if (poseMismatch(pose, live).length > 0) {
        await applyPose(page, pose);
        await waitSettled(page, shot.label);
        live = await readLiveCameraState(page);
        const mismatches = poseMismatch(pose, live);
        if (mismatches.length > 0) {
          throw new Error(
            `'${shot.label}' pose mismatch on [${mismatches.join(', ')}] — ` +
              `requested ${JSON.stringify(pose)}, live ${JSON.stringify(live)}`,
          );
        }
      }
    }

    const bytes = await writeThumbnail(await page.screenshot({ type: 'png' }), shot.outPath);
    return { status: 'captured', label: shot.label, bytes };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const withPage =
      pageErrors.length > 0 ? `${reason} (page errors: ${pageErrors.join('; ')})` : reason;
    return { status: 'failed', label: shot.label, reason: withPage };
  } finally {
    await context.close();
  }
}
