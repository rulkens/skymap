/**
 * Record every film in the website's loop manifest from a running app: open
 * the manifest picture it starts from, then move the camera or the clock one
 * step per frame and read the canvas back, so the film is exact however slow
 * a frame is to draw. Each is written as H.264 into the site's committed assets.
 *
 *   npm run site:loops -- --url http://localhost:5178 [--only id,id] [--from-masters]
 *
 * `--from-masters` re-encodes from the PNG frames kept in `data/shots/site/loops/<id>/` (gitignored).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { siteShot } from '../../packages/website/src/data/siteShot';
import { SITE_LOOPS } from '../../packages/website/src/data/siteLoops';
import type { SkymapWindow } from '../../src/@types/automation/SkymapWindow';
import { cancelCameraTween, commitCameraPose } from '../../src/state/camera/cameraSlice';
import { setSimDays } from '../../src/state/time/timeSlice';
import { absoluteArm } from '../../src/utils/camera/absoluteArm';
import { dispatchActions } from '../utils/browser/dispatchActions';
import { launchChromium } from '../utils/browser/launchChromium';
import { readCanvas } from '../utils/shot/readCanvas';
import { SITE_LOOP_PLAN } from './siteLoopPlan';
import { loopVideoArgs } from './utils/loopVideoArgs';
import { loopYaw } from './utils/loopYaw';
import { openSiteShot } from './utils/openSiteShot';

const MASTERS_DIR = 'data/shots/site/loops';
const OUT_DIR = 'packages/website/src/assets/loops';
// The same as the stills (shootSiteShots.ts), so stars are drawn the same size in both.
const DPR = 2;

const args = process.argv.slice(2);
const valueOf = (flag: string) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
const base = valueOf('--url');
const only = valueOf('--only')?.split(',');
const fromMasters = args.includes('--from-masters');
if (!base && !fromMasters) {
  console.error('usage: npm run site:loops -- --url <app server> [--only id,id] [--from-masters]');
  process.exit(1);
}
const unknown = only?.filter((id) => !SITE_LOOPS.some((loop) => loop.id === id)) ?? [];
if (unknown.length > 0) {
  console.error(`not in the manifest: ${unknown.join(', ')}`);
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
const rows = SITE_LOOPS.filter((loop) => !only || only.includes(loop.id));
const browser = fromMasters ? undefined : await launchChromium();
let failed = false;
try {
  for (const loop of rows) {
    const framesDir = join(MASTERS_DIR, loop.id);
    const frameCount = loop.seconds * SITE_LOOP_PLAN.fps;
    if (browser) {
      const shot = siteShot(loop.shot);
      rmSync(framesDir, { recursive: true, force: true });
      mkdirSync(framesDir, { recursive: true });
      const context = await browser.newContext({ viewport: shot.size, deviceScaleFactor: DPR });
      try {
        const page = await context.newPage();
        await openSiteShot(page, base!, shot);
        const start = await page.evaluate(() => {
          const state = (window as unknown as SkymapWindow).__skymap!.getState();
          return { camera: state.camera.base, simDays: state.time.anchor.simDays };
        });
        // Frame 0 is the still; the frame after the last would be frame 0 again, which is the seam.
        for (let frame = 0; frame < frameCount; frame++) {
          const turn = frame / frameCount;
          if (loop.motion === 'orbit' || 'swayDeg' in loop.motion) {
            // Every place settles in the absolute frame; a body-fixed or site pose has no yaw to turn.
            if (start.camera.frame !== 'absolute') {
              throw new Error(`cannot turn the camera in the "${start.camera.frame}" frame`);
            }
            const yaw = start.camera.pose.yaw + loopYaw(loop.motion, turn);
            await dispatchActions(page, [
              cancelCameraTween(),
              commitCameraPose(absoluteArm({ ...start.camera.pose, yaw })),
            ]);
          } else {
            const simDays = start.simDays + turn * loop.motion.clockDays;
            await dispatchActions(page, [setSimDays({ simDays, nowMs: 0 })]);
          }
          // One frame for the store change to reach the renderer; readCanvas draws the next and reads it.
          await page.evaluate(() => (window as unknown as SkymapWindow).__skymap!.nextFrame());
          writeFileSync(
            join(framesDir, `${String(frame).padStart(4, '0')}.png`),
            await readCanvas(page, 'png'),
          );
        }
      } catch (err) {
        failed = true;
        console.error(`${loop.id}: ${err instanceof Error ? err.message : String(err)}`);
        continue;
      } finally {
        await context.close();
      }
    }
    if (!existsSync(join(framesDir, '0000.png'))) {
      failed = true;
      console.error(`${loop.id}: no frames in ${framesDir}; run with --url first`);
      continue;
    }
    const file = join(OUT_DIR, `${loop.id}.mp4`);
    let crf = SITE_LOOP_PLAN.crf;
    let kb = Infinity;
    for (
      ;
      kb > SITE_LOOP_PLAN.maxKb && crf <= SITE_LOOP_PLAN.crfCeiling;
      crf += SITE_LOOP_PLAN.crfStep
    ) {
      const frames = join(framesDir, '%04d.png');
      execFileSync('ffmpeg', ['-v', 'error', ...loopVideoArgs(SITE_LOOP_PLAN, crf, frames, file)]);
      kb = Math.round(statSync(file).size / 1024);
    }
    if (kb > SITE_LOOP_PLAN.maxKb) failed = true;
    console.log(`${loop.id}  ${kb} KB at CRF ${crf - SITE_LOOP_PLAN.crfStep}`);
  }
} finally {
  await browser?.close();
}
process.exit(failed ? 1 : 0);
