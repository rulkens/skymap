/**
 * record — the offline tour recorder: play a skymap tour under CDP
 * virtual time in headless Chromium and encode the captured frames straight
 * to an mp4.
 *
 *   npm run record-tour -- --beats 1..1 --size 640x360 --fps 10
 *   npm run record-tour                       # full grand tour, 4K/60
 *
 * ### Why a harness outside the app
 *
 * A film-quality take cannot be captured live: a 4K WebGPU frame plus a PNG
 * readback takes far longer than 16 ms, so recording in wall-clock time would
 * drop frames and tie output quality to the host GPU's mood. Instead the
 * page's clock is handed to this Node process via CDP virtual time — each
 * loop iteration grants exactly 1000/fps ms, waits for the page to consume
 * it, and only then captures, so the tour plays frame-perfect no matter how
 * long each frame takes to render or encode. That loop needs a CDP session,
 * a spawned ffmpeg, and the host filesystem, none of which can live in the
 * app; the app's entire contribution is the `window.__skymapRecorder` seam
 * (installed only under `?cinema`) that this harness drives through
 * `page.evaluate`.
 *
 * ### The three launch-pattern findings (plan Ledger, Task 1 — mandatory)
 *
 * 1. `chromium.launch({ channel: 'chromium' })` — Playwright's default
 *    headless SHELL exposes `navigator.gpu` but yields NO adapter; the full
 *    Chromium build runs WebGPU under new headless with no flags. If the
 *    channel is missing (`npx playwright install chromium`), the known-working
 *    fallback is the shell with '--enable-unsafe-webgpu --use-angle=metal'.
 * 2. Frames come from raw CDP `Page.captureScreenshot({ fromSurface: true })`,
 *    NEVER `page.screenshot()`: Playwright's screenshot runs rAF-driven
 *    readiness waits that deadlock once the virtual-time budget is exhausted.
 * 3. Every in-page interaction under paused virtual time goes through
 *    `page.evaluate` — Playwright locator actions await element stability via
 *    rAF, which never fires without a budget.
 *
 * ### Why frames pipe to ffmpeg's stdin (no frames directory, ever)
 *
 * A full take is ~20k 4K PNGs ≈ 200 GB. The frames only ever need to exist
 * once, as encoded video, so each PNG buffer is written straight to a spawned
 * ffmpeg's stdin ('image2pipe' — see tools/utils/record/buildFfmpegArgs.ts
 * for the pinned codec settings). Backpressure is respected by awaiting each
 * write's flush callback before capturing the next frame, so a slow encoder
 * throttles capture instead of ballooning this process's heap.
 *
 * ### How tour completion is observed (the promise bridge)
 *
 * `hook.startTour(...)` resolves when the tour ends, but awaiting it inline
 * would deadlock: the evaluate would block while the loop that grants the
 * virtual time the tour needs never runs. The kick evaluate instead attaches
 * .then/.catch handlers that write a `window.__recorderTakeStatus` flag, and
 * the frame loop polls that flag at each frame boundary. The alternative —
 * bridging the resolution out via `page.exposeFunction` — would deliver it as
 * an out-of-band CDP message racing the frame loop in real time, making a
 * take's frame count depend on wire timing; sampling a flag at frame
 * boundaries keeps the stop frame a pure function of the virtual clock, the
 * same determinism the Task 1 spike asserted for pixels. (The tour's final
 * state lands inside some budget grant, and promise `.then` microtasks run
 * with that same JS turn, so the flag is already set by the time that grant's
 * `virtualTimeBudgetExpired` fires — no extra frame of lag.)
 *
 * ### Startup choreography (order matters)
 *
 * Boot runs in REAL time: `?cinema` skips the splash, and the hook's `ready`
 * promise already debounces "engine ready + loads settled" over a ~1 s
 * stability window, so the harness just awaits it. Virtual time is paused
 * BEFORE `startTour` is dispatched, so the tour's very first frame runs under
 * the virtual clock — dispatching first would let a nondeterministic sliver
 * of real time leak into the opening pose (same reasoning as the spike's
 * auto-rotate ordering).
 *
 * Prerequisites: `npm run dev` serving --url (default http://localhost:5173),
 * ffmpeg + ffprobe on PATH (macOS: brew install ffmpeg), and the Playwright
 * 'chromium' channel installed.
 */

import { chromium, type Browser, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Writable } from 'node:stream';
import { tourRegistry } from '../../src/data/animation/tours/tourRegistry';
import { FOLD_SETTLE_MS } from '../../src/state/tour/foldSettleMs';
import type { Tour } from '../../src/@types/animation/tour/Tour';
import type { TourId } from '../../src/@types/animation/tour/TourId';
import type { BeatRange } from '../../src/@types/animation/tour/BeatRange';
import type { RecorderWindow } from '../../src/@types/recorder/RecorderWindow';
import { grantAndAwaitExpiry } from './grantAndAwaitExpiry';
import { parseBeatRange } from '../utils/record/parseBeatRange';
import { parseSize } from '../utils/record/parseSize';
import { buildFfmpegArgs } from '../utils/record/buildFfmpegArgs';
import { defaultOutName } from '../utils/record/defaultOutName';
import { tourFrameCap } from '../utils/record/tourFrameCap';

// How long to wait for window.__skymapRecorder to appear after load — it is
// installed synchronously during app bootstrap, so a miss means the wrong
// page, not a slow one.
const HOOK_TIMEOUT_MS = 15_000;
// How many mid-boot navigations to absorb before giving up. One is expected
// on a cold cache (Vite's dependency-optimization reload, see
// awaitCaptureReady); more than a couple means the page is reload-looping,
// not optimizing.
const MAX_BOOT_NAVIGATIONS = 2;
// Progress cadence: one 'frame N / cap' line per this many frames.
const PROGRESS_EVERY_FRAMES = 60;
// ffmpeg is chatty on stderr; keep only the tail for the failure report.
const FFMPEG_STDERR_TAIL_LINES = 40;

type RecordOptions = {
  tourId: string;
  beats: BeatRange | undefined;
  fps: number;
  /** OUTPUT film resolution — the page viewport is size/dpr (see captureTake). */
  size: { width: number; height: number };
  /** deviceScaleFactor for the page; --size stays the output resolution. */
  dpr: number;
  /** Explicit --out, used verbatim; absent = timestamped default (see main). */
  out: string | undefined;
  url: string;
};

type Take = { kind: 'tour'; id: TourId; beats: BeatRange };

/**
 * The in-page flag the kick evaluate writes and the frame loop polls — see
 * the module header's "promise bridge" section for why this exists instead
 * of awaiting startTour inline or bridging via exposeFunction.
 */
type TakeStatus = { done: boolean; error: string | null };

type RecorderPageWindow = RecorderWindow & { __recorderTakeStatus?: TakeStatus };

/**
 * Bespoke argv loop rather than tools/utils/cli/args.ts: parseFlags is
 * deliberately boolean-only, and its own docstring keeps string/number-valued
 * flags in per-script loops. Value validation lives in the Task 2 helpers
 * (parseBeatRange / parseSize), not here.
 */
function parseArgs(argv: readonly string[]): RecordOptions {
  const options: RecordOptions = {
    tourId: 'grandTour',
    beats: undefined,
    fps: 60,
    size: parseSize('3840x2160'),
    // Default 2, not 1: DOM captions are authored in CSS pixels, and a
    // designer judges them on a 2x display — see the didactic block at the
    // viewport derivation in captureTake for the full proportion argument.
    dpr: 2,
    // No fixed default name: main derives a timestamped one via
    // defaultOutName so successive default-flag takes never overwrite each
    // other (buildFfmpegArgs passes -y). An explicit --out is used verbatim.
    out: undefined,
    url: 'http://localhost:5173',
  };
  let positionalSeen = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (
      arg === '--beats' ||
      arg === '--fps' ||
      arg === '--size' ||
      arg === '--dpr' ||
      arg === '--out' ||
      arg === '--url'
    ) {
      const value = argv[++i];
      if (value === undefined) throw new Error(`${arg} requires a value`);
      if (arg === '--beats') options.beats = parseBeatRange(value);
      if (arg === '--fps') {
        options.fps = Number(value);
        if (!Number.isInteger(options.fps) || options.fps < 1) {
          throw new Error(`--fps must be a positive integer, got '${value}'`);
        }
      }
      if (arg === '--size') options.size = parseSize(value);
      if (arg === '--dpr') {
        // Only 1 or 2: the app clamps devicePixelRatio to 2 when sizing the
        // canvas backing store (src/services/gpu/device.ts), so a higher dpr
        // would shrink the viewport without adding a single rendered pixel.
        if (value !== '1' && value !== '2') {
          throw new Error(`--dpr must be 1 or 2, got '${value}'`);
        }
        options.dpr = Number(value);
      }
      if (arg === '--out') options.out = value;
      if (arg === '--url') options.url = value.replace(/\/$/, '');
    } else if (arg.startsWith('--')) {
      throw new Error(
        `unknown flag '${arg}' ` +
          '(known: --beats, --fps, --size, --dpr, --out, --url; positional: tour id)',
      );
    } else if (!positionalSeen) {
      options.tourId = arg;
      positionalSeen = true;
    } else {
      throw new Error(`unexpected extra positional '${arg}' — only one tour id is accepted`);
    }
  }
  // The viewport is size/dpr in CSS pixels, and Playwright viewports are
  // integral — a 4K output divides cleanly by 2, but an odd custom size
  // would silently round and ship a film at the wrong resolution.
  if (options.size.width % options.dpr !== 0 || options.size.height % options.dpr !== 0) {
    throw new Error(
      `--size ${options.size.width}x${options.size.height} does not divide evenly by ` +
        `--dpr ${options.dpr} — the page viewport is size/dpr and must be a whole number ` +
        'of CSS pixels',
    );
  }
  return options;
}

/**
 * Launch pattern per the Task 1 ledger: the 'chromium' channel first (full
 * build, WebGPU with no flags), falling back to the headless shell with the
 * WebGPU flags only if the channel is not installed. The fallback prints a
 * warning rather than failing outright so a machine without the channel can
 * still record, but the fix worth making is 'npx playwright install chromium'.
 */
async function launchChromium(): Promise<Browser> {
  try {
    return await chromium.launch({ channel: 'chromium' });
  } catch (err) {
    console.warn(
      `chromium channel launch failed (${err instanceof Error ? err.message.split('\n')[0] : String(err)})`,
    );
    console.warn(
      "falling back to the headless shell with '--enable-unsafe-webgpu --use-angle=metal'; " +
        "prefer 'npx playwright install chromium' for the proven full-build path",
    );
    return chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-angle=metal'] });
  }
}

// Virtual-time stepping: grantAndAwaitExpiry.ts carries the CDP invariants.

type FfmpegHandle = {
  proc: ChildProcess;
  stdin: Writable;
  /** Resolves with the exit code once ffmpeg closes (never rejects). */
  exited: Promise<number | null>;
  stderrTail: () => string;
};

/**
 * Spawn ffmpeg with the pinned encode argv and fail fast — before any browser
 * work — if the binary is missing. Node surfaces a missing binary as an
 * async 'error' event (ENOENT), not a spawn() throw, so this awaits the
 * spawn/error race explicitly to turn it into a clear install hint.
 */
async function spawnFfmpeg(fps: number, out: string): Promise<FfmpegHandle> {
  // ffmpeg does not create directories; the default out lands in recordings/.
  mkdirSync(dirname(out), { recursive: true });
  const proc = spawn('ffmpeg', buildFfmpegArgs({ fps, out }), {
    stdio: ['pipe', 'ignore', 'pipe'],
  });
  await new Promise<void>((resolve, reject) => {
    proc.once('spawn', () => resolve());
    proc.once('error', (err: NodeJS.ErrnoException) => {
      reject(
        err.code === 'ENOENT'
          ? new Error(
              'ffmpeg not found on PATH — the recorder encodes through a host ffmpeg. ' +
                "Install it first (macOS: 'brew install ffmpeg').",
            )
          : err,
      );
    });
  });
  const { stdin, stderr } = proc;
  if (stdin === null || stderr === null) {
    throw new Error('ffmpeg spawned without stdin/stderr pipes — stdio wiring bug');
  }
  // Rolling stderr tail: ffmpeg logs its whole progress stream here, and only
  // the last lines matter when the encode fails.
  const stderrLines: string[] = [];
  stderr.on('data', (chunk: Buffer) => {
    for (const line of chunk.toString().split('\n')) {
      if (line.trim() !== '') stderrLines.push(line);
    }
    if (stderrLines.length > FFMPEG_STDERR_TAIL_LINES) {
      stderrLines.splice(0, stderrLines.length - FFMPEG_STDERR_TAIL_LINES);
    }
  });
  // A write() callback receives any pipe error, but Node ALSO emits it as an
  // 'error' event on the stream — unhandled, that would crash the process
  // before the catch block can print the ffmpeg stderr tail. Swallow the
  // duplicate here; the write path still sees the failure.
  stdin.on('error', () => {});
  const exited = new Promise<number | null>((resolve) => proc.once('close', resolve));
  return { proc, stdin, exited, stderrTail: () => stderrLines.join('\n') };
}

/**
 * Write one PNG frame to ffmpeg's stdin, resolving only when the chunk has
 * been flushed to the pipe. Awaiting the flush callback serializes writes and
 * IS the backpressure handling — the loop cannot capture frame N+1 until
 * ffmpeg has accepted frame N, which is the same throttle as checking
 * write()'s boolean and waiting for 'drain', with none of the state.
 */
function writeFrame(stdin: Writable, png: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    stdin.write(png, (err) => (err ? reject(err) : resolve()));
  });
}

/**
 * Did an evaluate/wait die because the page navigated out from under it?
 * Playwright reports that as 'Execution context was destroyed, most likely
 * because of a navigation' (waitForFunction variants mention the navigation
 * too). Only the boot phase treats this as retryable — see awaitCaptureReady.
 */
function isNavigationInterruption(err: unknown): boolean {
  return (
    err instanceof Error &&
    /execution context was destroyed|because of a navigation/i.test(err.message)
  );
}

/**
 * One attempt at the real-time boot wait: the recorder hook appears, then its
 * `ready` promise resolves. `ready` already debounces "engine ready + loads
 * settled" over a ~1 s stability window, and a cold catalog fetch can
 * legitimately take tens of seconds, so the ready evaluate carries no
 * harness-side timeout.
 *
 * The whole wait is retryable by the caller because it runs BEFORE virtual
 * time is paused: a navigation here just means booting again in real time.
 * The known trigger is Vite's one-time dependency optimization — the first
 * ever page load against a fresh worktree/cold cache discovers new deps,
 * re-bundles them, and force-reloads the page mid-boot, destroying the
 * execution context these waits live in. A navigation error must reach the
 * caller unwrapped (the hook-timeout rewrite below is only for genuine
 * timeouts) so the retry loop can recognize it.
 */
async function awaitCaptureReady(page: Page, url: string): Promise<void> {
  try {
    await page.waitForFunction(
      () => (window as unknown as RecorderWindow).__skymapRecorder !== undefined,
      undefined,
      { timeout: HOOK_TIMEOUT_MS, polling: 100 },
    );
  } catch (err) {
    if (isNavigationInterruption(err)) throw err;
    throw new Error(
      `window.__skymapRecorder never appeared within ${HOOK_TIMEOUT_MS} ms at ` +
        `${url}/?cinema — the hook installs only in cinema mode, on a build that ` +
        'includes installRecorderHook. Is the dev server running this branch?',
    );
  }
  console.log('waiting for capture-ready (engine ready + loads settled, real time) ...');
  await page.evaluate(() => {
    const hook = (window as unknown as RecorderWindow).__skymapRecorder;
    if (hook === undefined) throw new Error('__skymapRecorder missing');
    return hook.ready;
  });
}

/**
 * The capture side of the pipeline, decoupled from encoding: boot the cinema
 * page in real time, pause virtual time, kick the take, then step
 * grant → captureScreenshot → writePng until the in-page status flag reports
 * the take ended. Returns the number of frames captured. Encoding enters only
 * through the injected writePng, so this function knows nothing about ffmpeg.
 */
async function captureTake(
  browser: Browser,
  options: RecordOptions,
  take: Take,
  frameCap: number,
  writePng: (png: Buffer) => Promise<void>,
): Promise<number> {
  // `--size` is the OUTPUT film resolution; the page runs in a viewport of
  // size/dpr CSS pixels at deviceScaleFactor dpr (default 2). Two reasons:
  //
  // - Proportions: DOM captions are typeset in CSS pixels. A 3840x2160
  //   viewport at dpr 1 sets them against a 4K frame — half the relative size
  //   a designer sees on a 2x display. A 1920x1080 viewport at dpr 2 yields
  //   the same 3840x2160 frame with captions at their designed proportions.
  // - Free fidelity: the app sizes the canvas backing store to
  //   clientSize x min(devicePixelRatio, 2) (resizeCanvasToDisplay in
  //   src/services/gpu/device.ts), so both configurations rasterize the very
  //   same native 4K canvas — dpr 2 costs no extra GPU work. That cap is also
  //   why --dpr stops at 2.
  //
  // Pixel contract — established EMPIRICALLY against headless-new Chromium,
  // not from docs or Playwright source: an UNCLIPPED fromSurface capture
  // returns a CSS-px-sized image regardless of deviceScaleFactor (a 640x360
  // --size at dpr 2, i.e. a 320x180 viewport, came back as a 320x180 mp4).
  // Device-pixel output must be bought explicitly: the capture loop passes
  // clip = the full viewport in CSS px with scale = dpr (CDP Viewport;
  // clip.scale multiplies the capture resolution), making every frame
  // viewport x dpr = --size exactly. At dpr 1 the scale is 1 and the clip is
  // a no-op — one code path, no branch. (Playwright's crPage.js scale:'css'
  // handling suggests raw captures are device-px, but that describes its
  // CLIPPED path — the unclipped surface capture demonstrably scales to CSS
  // px here.)
  const viewport = {
    width: options.size.width / options.dpr,
    height: options.size.height / options.dpr,
  };
  const context = await browser.newContext({ viewport, deviceScaleFactor: options.dpr });
  const page = await context.newPage();
  // Surface page-side failures immediately — a dead take should explain
  // itself in the harness output, not require reproducing in a headed run.
  page.on('pageerror', (err) => console.warn(`[page] error: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.warn(`[page] console.error: ${msg.text()}`);
  });

  console.log(`loading ${options.url}/?cinema ...`);
  await page.goto(`${options.url}/?cinema`, { waitUntil: 'load' });

  // Bounded retry around the boot wait: safe ONLY here, in real time before
  // the pause — the reloaded page reinstalls the hook and boots again, and no
  // virtual-time or tour state exists yet to lose. Once virtual time is
  // paused (below), a navigation destroys the virtual clock and the running
  // tour with it, so the capture loop deliberately has no such tolerance.
  for (let navigations = 0; ; navigations++) {
    try {
      await awaitCaptureReady(page, options.url);
      break;
    } catch (err) {
      if (!isNavigationInterruption(err) || navigations >= MAX_BOOT_NAVIGATIONS) throw err;
      console.warn(
        '[boot] page navigated during the ready wait (expected once on a cold cache: ' +
          "Vite's dependency-optimization reload) — retrying the wait",
      );
    }
  }

  // Pause BEFORE dispatching the tour — see the module header's choreography
  // section. From here on, page time advances only by explicit grants.
  const session = await context.newCDPSession(page);
  await session.send('Emulation.setVirtualTimePolicy', { policy: 'pause' });

  // Kick the take under paused virtual time (finding 3: evaluate, never a
  // locator action). The evaluate returns immediately — the startTour promise
  // is deliberately NOT awaited; its outcome lands in __recorderTakeStatus.
  await page.evaluate((take) => {
    const w = window as unknown as RecorderPageWindow;
    const hook = w.__skymapRecorder;
    if (hook === undefined) throw new Error('__skymapRecorder missing');
    const status: TakeStatus = { done: false, error: null };
    w.__recorderTakeStatus = status;
    hook.startTour(take.id, take.beats).then(
      () => {
        status.done = true;
      },
      (err: unknown) => {
        status.error = err instanceof Error ? err.message : String(err);
        status.done = true;
      },
    );
  }, take);

  // A windowed take (from > 0) opens with the saga's reconstruction fold plus
  // its FOLD_SETTLE_MS delay: the visibility bridge and label-fade envelope
  // animate the folded diff, and the saga holds the first beat until they
  // finish (src/state/tour/foldSettleMs.ts). Burn exactly that much virtual
  // time WITHOUT capturing — grant and discard, no ffmpeg write — so the
  // film's first frame is the settled scene, not the reconstruction dissolve.
  // Full takes skip this: beat 0's fold equals the live baseline. The frame
  // cap below applies to CAPTURED frames only; these discards sit outside it.
  if (take.beats.from > 0) {
    const settleFrames = Math.ceil((FOLD_SETTLE_MS / 1000) * options.fps);
    console.log(`settling scene reconstruction: discarding ${settleFrames} frames`);
    for (let settle = 0; settle < settleFrames; settle++) {
      await grantAndAwaitExpiry(session, 1000 / options.fps, `settle ${settle}`);
    }
  }

  console.log(
    `stepping at ${(1000 / options.fps).toFixed(2)} ms per frame ` +
      `(cap ${frameCap} captured frames) ...`,
  );
  let frame = 0;
  while (true) {
    // Poll the bridge at the frame boundary (module header: deterministic
    // stop frame). Checked BEFORE granting so a take that ends inside grant N
    // yields exactly N captured frames, the last one showing the final pose.
    const status = await page.evaluate(
      () => (window as unknown as RecorderPageWindow).__recorderTakeStatus,
    );
    if (status === undefined) {
      throw new Error('__recorderTakeStatus vanished — did the page reload mid-take?');
    }
    if (status.error !== null) throw new Error(`startTour rejected in-page: ${status.error}`);
    if (status.done) break;
    if (frame >= frameCap) {
      throw new Error(
        `aborting at frame ${frame}: cap ${frameCap} exceeded and '${take.kind} ${take.id}' ` +
          'has not ended — likely a beat stuck on a waitUntil readiness gate (catalog focus ' +
          'never loaded?). Check the [page] warnings above.',
      );
    }
    await grantAndAwaitExpiry(session, 1000 / options.fps, `frame ${frame}`);
    // Raw CDP capture of the compositor surface (finding 2) — what the
    // display would show after this grant's present. The explicit clip with
    // scale = dpr is what makes the frame device-pixel-sized (= --size); an
    // unclipped capture comes back in CSS px — see the pixel-contract note at
    // the viewport derivation above.
    const shot = await session.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      clip: { x: 0, y: 0, width: viewport.width, height: viewport.height, scale: options.dpr },
    });
    await writePng(Buffer.from(shot.data, 'base64'));
    frame++;
    if (frame % PROGRESS_EVERY_FRAMES === 0) console.log(`  frame ${frame} / ${frameCap}`);
  }

  await context.close();
  return frame;
}

/**
 * Verify the encoded file with ffprobe and report what actually landed on
 * disk — the smoke check is "does the container say the size and frame count
 * we intended", not "did ffmpeg exit 0" alone.
 */
async function ffprobeReport(
  out: string,
): Promise<{ width: number; height: number; nbFrames: string }> {
  const proc = spawn(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'v:0', '-show_streams', '-of', 'json', out],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let stdout = '';
  let stderr = '';
  proc.stdout?.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
  proc.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
  const code = await new Promise<number | null>((resolve, reject) => {
    proc.once('error', (err: NodeJS.ErrnoException) => {
      reject(
        err.code === 'ENOENT'
          ? new Error("ffprobe not found on PATH — it ships with ffmpeg ('brew install ffmpeg')")
          : err,
      );
    });
    proc.once('close', resolve);
  });
  if (code !== 0) throw new Error(`ffprobe exited with code ${String(code)}: ${stderr.trim()}`);
  const parsed = JSON.parse(stdout) as {
    streams?: { width?: number; height?: number; nb_frames?: string }[];
  };
  const stream = parsed.streams?.[0];
  if (stream?.width === undefined || stream.height === undefined) {
    throw new Error(`ffprobe reported no video stream in ${out}`);
  }
  return {
    width: stream.width,
    height: stream.height,
    nbFrames: stream.nb_frames ?? '(not reported)',
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  // Resolve the tour up front so an id typo fails before any process spawns.
  const tour = (tourRegistry as Record<string, Tour>)[options.tourId];
  if (tour === undefined) {
    throw new Error(
      `unknown tour '${options.tourId}' — known: ${Object.keys(tourRegistry).join(', ')}`,
    );
  }
  const range: BeatRange = options.beats ?? { from: 0, to: tour.beats.length - 1 };
  // The cap helper sums whatever slice it is given; slicing to the requested
  // range here is the caller contract its docstring names. Beat indices are
  // the 0-based '#' column of `npm run tour-length`.
  const slicedBeats = tour.beats.slice(range.from, range.to + 1);
  if (slicedBeats.length === 0) {
    throw new Error(
      `--beats ${range.from}..${range.to} selects no beats — '${tour.id}' has ` +
        `${tour.beats.length} beats (indices 0..${tour.beats.length - 1}; ` +
        "see 'npm run tour-length')",
    );
  }
  const frameCap = tourFrameCap(slicedBeats, options.fps);
  const take: Take = { kind: 'tour', id: tour.id, beats: range };

  // Default output name = tour + size + fps + timestamp, so successive
  // default-flag takes (or a smoke against a different tour) never silently
  // overwrite a previous film — ffmpeg runs -y. An explicit --out is exact
  // and CAN overwrite: a fixed name is then the operator's stated intent.
  // The banner below prints the resolved path either way.
  const out =
    options.out ??
    defaultOutName({
      tourId: tour.id,
      width: options.size.width,
      height: options.size.height,
      fps: options.fps,
      now: new Date(),
    });

  console.log(
    `record-tour — '${tour.id}' beats ${take.beats.from}..${take.beats.to} ` +
      `(${slicedBeats.length} of ${tour.beats.length})`,
  );
  console.log(
    `  ${options.size.width}x${options.size.height} @ ${options.fps} fps ` +
      `(viewport ${options.size.width / options.dpr}x${options.size.height / options.dpr} ` +
      `@ dpr ${options.dpr}) → ${out}`,
  );

  // ffmpeg first: a missing binary should fail in milliseconds, not after a
  // browser launch and a full app boot.
  const ffmpeg = await spawnFfmpeg(options.fps, out);
  let frames: number;
  try {
    const browser = await launchChromium();
    try {
      frames = await captureTake(browser, options, take, frameCap, (png) =>
        writeFrame(ffmpeg.stdin, png),
      );
    } finally {
      await browser.close();
    }
    // Closing stdin is ffmpeg's end-of-stream signal; it then finalizes the
    // container and exits. A nonzero code means the file is not trustworthy.
    ffmpeg.stdin.end();
    const code = await ffmpeg.exited;
    if (code !== 0) {
      throw new Error(`ffmpeg exited with code ${String(code)} — see the stderr tail below`);
    }
  } catch (err) {
    if (ffmpeg.proc.exitCode === null) ffmpeg.proc.kill('SIGKILL');
    const tail = ffmpeg.stderrTail();
    if (tail !== '') console.error(`\n--- ffmpeg stderr (tail) ---\n${tail}`);
    throw err;
  }

  const probe = await ffprobeReport(out);
  console.log(`\nDONE — ${out}`);
  console.log(`  captured frames: ${frames}  (cap was ${frameCap})`);
  console.log(`  ffprobe: ${probe.width}x${probe.height}, nb_frames ${probe.nbFrames}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
