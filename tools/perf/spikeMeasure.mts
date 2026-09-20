/**
 * spikeMeasure — THROWAWAY companion to `measurePerf.ts` for the inside-atmosphere
 * fog spike. `PerfPose` can only express an ABSOLUTE arm, and the poses this spike
 * needs (a camera standing inside an atmosphere, on Earth and on Mars) are BODY
 * arms — `logCameraState`'s `bodyArmMetres` form, which also carries the roll the
 * absolute rows drop.
 *
 * Landing one is a two-step dance, not a commit: a plain `commitCameraPose` is
 * LOST under the followed body focus (the follow driver outranks `resting`), so
 * the absolute pose goes in as a zero-length `startCameraTween` first — tween
 * priority 60 beats it — and only then is the body arm committed, with
 * `setAutoRotate` rate 0 to keep the render-on-demand loop awake, the way the
 * perf hook's own `setPose` does. Time is pinned via `#t=` so the dump's absolute
 * pose is still the right one.
 *
 * Merged strategy only — the production encode shape, the section the perf skill
 * says to quote.
 */

import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { statsOf } from '../utils/perf/statsOf';
import { frameTotals } from '../utils/perf/frameTotals';
import { median } from '../utils/perf/median';
import { bootHookedPage } from '../utils/browser/bootHookedPage';
import { readLiveCameraState } from '../utils/browser/readLiveCameraState';
import type { PerfSample } from '../../src/@types/perf/PerfSample';

type SpikePose = {
  readonly label: string;
  /** A `logCameraState` dump (body arm), an absolute `PerfPose`, or a fly-to. */
  readonly dumpPath?: string;
  readonly absolute?: { target: number[]; yaw: number; pitch: number; distance: number };
  readonly flyTo?: { lonDeg: number; latDeg: number; body: string; altKm: number };
};

const J2000_UNIX_MS = 946728000000;
/** The user's Everest dump's instant, reused by every pose that carries none. */
const DEFAULT_SIM_DAYS = 2461304.571778822;

const args = process.argv.slice(2);
function flag(name: string, fallback: string): string {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1]!;
}

const url = flag('url', 'http://localhost:5173');
const frames = Number(flag('frames', '40'));
const dpr = Number(flag('dpr', '2'));
const settleMs = Number(flag('settle', '14000'));
const shotDir = flag('shots', '');
const poses: SpikePose[] = JSON.parse(readFileSync(flag('poses', ''), 'utf8'));

const browser = await chromium.launch({
  args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=metal'],
});
try {
  for (const p of poses) {
    const dump = p.dumpPath === undefined ? null : JSON.parse(readFileSync(p.dumpPath, 'utf8'));
    // EVERY pose boots with a pinned instant, not just the dumps: `#t=` is also
    // what suppresses the Welcome splash, and a splash over the canvas is not
    // the scene — neither to look at nor to time.
    const simDays = dump === null ? DEFAULT_SIM_DAYS : dump.simDays;
    const hash = `#t=${new Date(J2000_UNIX_MS + (simDays - 2451545.0) * 86400000).toISOString()}`;

    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: dpr,
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await bootHookedPage(page, `${url}/?perf${hash}`, '__skymapPerf');

    await page.evaluate(
      (a) => {
        const hook = (window as any).__skymapPerf;
        hook.setStrategy('merged');
        if (a.dump !== null) {
          const to = {
            target: a.dump.target,
            yaw: a.dump.yaw,
            pitch: a.dump.pitch,
            distance: a.dump.distanceMpc,
          };
          hook.dispatch({
            type: 'camera/startCameraTween',
            payload: {
              from: to,
              to,
              durationMs: 300,
              easing: 'easeOutCubic',
              frame: hook.getState().settings.orientation,
            },
          });
        } else if (a.flyTo !== null) {
          hook.dispatch({ type: 'camera/flyToLonLat', payload: a.flyTo });
        } else {
          hook.dispatch({ type: 'camera/cancelCameraTween' });
          hook.dispatch({
            type: 'camera/commitCameraPose',
            payload: { frame: 'absolute', pose: a.absolute },
          });
          hook.dispatch({ type: 'camera/setAutoRotate', payload: { active: true, rate: 0 } });
        }
      },
      { dump, absolute: p.absolute ?? null, flyTo: p.flyTo ?? null },
    );

    // Let the tween (dump) or the fly-to land before the arm goes in. The dump
    // gap is SHORT on purpose: a `commitsOnEdge` driver (follow approach) bakes
    // its stale pose into `camera.base` on its deactivating edge, so a commit
    // made long after the tween can be overwritten by one that lands later.
    await page.waitForTimeout(p.flyTo !== undefined ? 6000 : dump === null ? 500 : 1500);

    if (dump !== null) {
      await page.evaluate((d) => {
        const hook = (window as any).__skymapPerf;
        const kind = String(d.frame).split(':')[0] as string;
        const id = String(d.frame).split(':')[1] as string;
        const arm = d.bodyArmMetres;
        hook.dispatch({ type: 'camera/cancelCameraTween' });
        hook.dispatch({
          type: 'camera/commitCameraPose',
          payload: {
            frame: { [kind]: id },
            pose: {
              bodyId: id,
              anchorLocalM: arm.anchorLocalM,
              eyeRelAnchorM: arm.eyeRelAnchorM,
              basisLocal: arm.basisLocal,
            },
          },
        });
        hook.dispatch({ type: 'camera/setAutoRotate', payload: { active: true, rate: 0 } });
      }, dump);
    } else if (p.flyTo !== undefined) {
      // Freeze whatever arm the fly-to settled in, then hold it the same way.
      await page.evaluate(() => {
        const hook = (window as any).__skymapPerf;
        const base = JSON.parse(JSON.stringify(hook.getState().camera.base));
        hook.dispatch({ type: 'camera/cancelCameraTween' });
        hook.dispatch({ type: 'camera/commitCameraPose', payload: base });
        hook.dispatch({ type: 'camera/setAutoRotate', payload: { active: true, rate: 0 } });
      });
    }

    // Keep the render-on-demand loop awake for the sampling window. `autoRotate`
    // is INERT on a body arm (its `isActive` requires a world arm), so the flag
    // alone never wakes these poses and `collectTimings` waits forever. A
    // `camera/` write IS a wake route, so re-dispatching the same no-op
    // `setAutoRotate` per rAF pumps the scheduler while changing nothing.
    // (An ANONYMOUS arrow, deliberately: tsx compiles a *named* function
    // expression with esbuild's `keepNames`, which injects a `__name` helper
    // that does not exist inside `page.evaluate`'s isolated scope.)
    await page.evaluate(() => {
      setInterval(() => {
        (window as any).__skymapPerf.dispatch({
          type: 'camera/setAutoRotate',
          payload: { active: true, rate: 0 },
        });
      }, 8);
    });

    await page.waitForTimeout(settleMs);
    if (shotDir !== '') await page.screenshot({ path: `${shotDir}/${p.label}.png` });

    // Verify the camera actually IS where the pose asked — a lost commit shows
    // up as a plausible-looking frame at the wrong vantage, timed and shot.
    const live = await readLiveCameraState(page);
    if (dump !== null) {
      console.log(
        `  pose requested yaw ${dump.yaw.toFixed(4)} pitch ${dump.pitch.toFixed(4)} dist ${dump.distanceMpc.toExponential(3)}`,
      );
    }
    console.log(
      `  pose live      yaw ${live.yaw.toFixed(4)} pitch ${live.pitch.toFixed(4)} dist ${live.distance.toExponential(3)}`,
    );

    const samples = (await page.evaluate(
      (n) => (window as any).__skymapPerf.collectTimings(n),
      frames,
    )) as PerfSample[];

    const stats = statsOf(samples);
    const totals = frameTotals(samples);
    console.log(`\n### ${p.label}  (dpr ${dpr}, ${frames} frames, merged)`);
    for (const s of stats.sort((a, b) => b.median - a.median)) {
      console.log(`  ${s.slot.padEnd(34)} ${s.median.toFixed(3).padStart(8)} ms`);
    }
    console.log(`  ${'TOTAL (merged)'.padEnd(34)} ${median(totals).toFixed(3).padStart(8)} ms`);
    if (errors.length > 0) console.log(`  page errors: ${errors.slice(0, 3).join(' | ')}`);
    await context.close();
  }
} finally {
  await browser.close();
}
