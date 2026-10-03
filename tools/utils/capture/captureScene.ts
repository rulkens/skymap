/**
 * captureScene — one framed shot of the running scene, start to written file.
 * Boot commits once (no fly-in, no re-settle — `arrival` owns that wait), so a
 * `capture.pose` override lands on top and stays: the "fly-in overwrites an
 * early pose" landmine `#focus=`/`#exhibit=` booting used to carry is gone.
 */
import type { Browser } from '@playwright/test';
import { bootHookedPage } from '../browser/bootHookedPage';
import { collectPageErrors } from '../browser/collectPageErrors';
import { dispatchActions } from '../browser/dispatchActions';
import { applyPose } from '../browser/applyPose';
import { labelDeclutterActions } from './labelDeclutterActions';
import { sceneDeclutterActions } from './sceneDeclutterActions';
import { shotPose } from './shotPose';
import { writeThumbnail } from './writeThumbnail';
import { VIEWPORT } from './shotDefaults';
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
    if (shot.exhibitId !== undefined && shot.focusId !== undefined) {
      throw new Error(`'${shot.label}' sets both 'exhibitId' and 'focusId' — boot takes one`);
    }
    const pose = shotPose(shot);
    const hash =
      shot.exhibitId !== undefined
        ? `exhibit=${shot.exhibitId}&t=${shot.t}`
        : shot.focusId !== undefined
          ? `focus=${shot.focusId}&t=${shot.t}`
          : `t=${shot.t}`;
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

    if (pose !== undefined) {
      await applyPose(page, pose);
    }

    if (shot.focusId !== undefined && shot.keepFocus !== true) {
      await page.keyboard.press('Escape');
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
