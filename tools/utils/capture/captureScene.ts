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
import { labelDeclutterActions } from './labelDeclutterActions';
import { sceneDeclutterActions } from './sceneDeclutterActions';
import { poseMismatch } from './poseMismatch';
import { shotPose } from './shotPose';
import { writeThumbnail } from './writeThumbnail';
import { POST_ESC_WAIT_MS, VIEWPORT } from './shotDefaults';
import { mergeSnapshot } from '../../../src/state/settings/mergeSnapshotAction';
import type { SceneShot } from '../../@types/capture/SceneShot';
import type { ShotOutcome } from '../../@types/capture/ShotOutcome';

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
    const hash = shot.focusId !== undefined ? `focus=${shot.focusId}&t=${shot.t}` : `t=${shot.t}`;
    await bootHookedPage(page, `${base}/?perf&cinema#${hash}`, '__skymapPerf');

    // Scene first, labels last, and the order is load-bearing: a snapshot is a
    // whole-cluster replacement, so a view's `galaxyCatalogs` carries its
    // Layer's default `labelEnabled: true` and would switch the labels back on
    // if it landed after them. Only a FOCUS shot strips scene content — a
    // view's subject is the scene itself, so its settings are the last word on
    // what belongs in the frame.
    await dispatchActions(page, [
      ...(shot.focusId !== undefined ? sceneDeclutterActions(shot.hideGalaxyField === true) : []),
      ...(shot.settings !== undefined ? [mergeSnapshot(shot.settings)] : []),
      ...labelDeclutterActions(),
    ]);
    await waitSettled(page, shot.label);

    if (pose !== undefined) {
      await applyPose(page, pose);
      await waitSettled(page, shot.label);
    }

    // A view boots with no selection: nothing to clear and no fly-in to
    // re-settle off of, so the pose applied above is trusted as-is.
    if (shot.focusId !== undefined) {
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
