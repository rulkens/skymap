/**
 * record — the offline take recorder: play one skymap take (a tour, optionally
 * windowed to beats, or a standalone clip) under CDP virtual time in headless
 * Chromium and encode the captured frames straight to an mp4.
 *
 *   npm run record-tour -- --beats 1..1 --size 640x360 --fps 10
 *   npm run record-tour                       # full grand tour, 4K/60
 *   npm run record-clip -- flyout             # one standalone clip
 *
 * Two independent clocks, both pinned on every take: `#t=<ISO>` in the capture
 * URL fixes the SIM clock (the instant the solar system is drawn at), while
 * the CDP budget drives the FRAME clock (page time per captured frame).
 * Pinning `t` freezes no animation — tweens, fades and clip timelines all run
 * on the frame clock.
 *
 * ### Why a harness outside the app
 *
 * A film-quality take cannot be captured live: a 4K WebGPU frame plus a PNG
 * readback takes far longer than 16 ms, so recording in wall-clock time would
 * drop frames and tie output quality to the host GPU's mood. Instead the
 * page's clock is handed to this Node process via CDP virtual time — each
 * loop iteration grants exactly 1000/fps ms, waits for the page to consume
 * it, and only then captures, so the take plays frame-perfect no matter how
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
 * ### How take completion is observed (the promise bridge)
 *
 * The hook's start verb resolves when the take ends, but awaiting it inline
 * would deadlock: the evaluate would block while the loop that grants the
 * virtual time the take needs never runs. The kick evaluate instead attaches
 * .then/.catch handlers that write a `window.__recorderTakeStatus` flag, and
 * the frame loop polls that flag at each frame boundary. The alternative —
 * bridging the resolution out via `page.exposeFunction` — would deliver it as
 * an out-of-band CDP message racing the frame loop in real time, making a
 * take's frame count depend on wire timing; sampling a flag at frame
 * boundaries keeps the stop frame a pure function of the virtual clock, the
 * same determinism the Task 1 spike asserted for pixels. (The take's final
 * state lands inside some budget grant, and promise `.then` microtasks run
 * with that same JS turn, so the flag is already set by the time that grant's
 * `virtualTimeBudgetExpired` fires — no extra frame of lag.)
 *
 * ### Startup choreography (order matters)
 *
 * Boot runs in REAL time: `?cinema` skips the splash, and the hook's `ready`
 * promise already debounces "engine ready + loads settled" over a ~1 s
 * stability window, so the harness just awaits it. Virtual time is paused
 * BEFORE the take is kicked, so its very first frame runs under the virtual
 * clock — kicking first would let a nondeterministic sliver of real time leak
 * into the opening pose (same reasoning as the spike's auto-rotate ordering).
 *
 * Prerequisites: `npm run dev` serving --url (default http://localhost:5173),
 * ffmpeg + ffprobe on PATH (macOS: brew install ffmpeg), and the Playwright
 * 'chromium' channel installed.
 */

import { chromium, type Browser, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import type { Writable } from 'node:stream';
import { tourRegistry } from '../../src/data/animation/tours/tourRegistry';
import { clipRegistry } from '../../src/data/animation/clips/clipRegistry';
import { FOLD_SETTLE_MS } from '../../src/state/tour/foldSettleMs';
import type { Tour } from '../../src/@types/animation/tour/Tour';
import type { TourId } from '../../src/@types/animation/tour/TourId';
import type { BeatRange } from '../../src/@types/animation/tour/BeatRange';
import type { Clip } from '../../src/@types/animation/Clip';
import type { ClipId } from '../../src/@types/animation/ClipId';
import type { RecorderWindow } from '../../src/@types/recorder/RecorderWindow';
import { grantAndAwaitExpiry } from './grantAndAwaitExpiry';
import { parseBeatRange } from '../utils/record/parseBeatRange';
import { parseSize } from '../utils/record/parseSize';
import { parsePreviewUrl } from '../utils/record/parsePreviewUrl';
import { buildFfmpegArgs } from '../utils/record/buildFfmpegArgs';
import { buildCaptureUrl } from '../utils/record/buildCaptureUrl';
import { defaultOutName } from '../utils/record/defaultOutName';
import { tourFrameCap } from '../utils/record/tourFrameCap';
import { clipFrameCap } from '../utils/record/clipFrameCap';
import { clipDurationSec } from '../utils/animation/clipDurationSec';
import { loopCycleFrameCount } from '../utils/record/loopCycleFrameCount';

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
// vite build's own console noise; same tail-keeping rationale as ffmpeg's.
const BUILD_LOG_TAIL_LINES = 40;

// --serve: a recorder-owned build directory, never `dist/` (that one belongs
// to deploys — see the module doc for --serve). Reused across takes unless
// --rebuild forces a fresh build.
const SERVE_BUILD_DIR = 'tools/record/.build';
// Arbitrary and quiet; strictPort is left off (vite's default) so a busy
// port just bumps instead of failing — see spawnPreviewServer, which reads
// the actual bound port back off stdout rather than assuming this one held.
const SERVE_PORT = 4517;
const PREVIEW_READY_TIMEOUT_MS = 30_000;

type RecordOptions = {
  tourId: string;
  /** --clip; set = the take is a clip, and the tour flags are rejected. */
  clipId: string | undefined;
  beats: BeatRange | undefined;
  fps: number;
  /** OUTPUT film resolution — the page viewport is size/dpr (see captureTake). */
  size: { width: number; height: number };
  /** deviceScaleFactor for the page; --size stays the output resolution. */
  dpr: number;
  /** Explicit --out, used verbatim; absent = timestamped default (see main). */
  out: string | undefined;
  url: string;
  /** --sim-time override; absent = resolved at take start (always pinned). */
  simTime: Date | undefined;
  /** --serve: self-serve a production build instead of hitting --url; see main(). */
  serve: boolean;
  /** --rebuild: force a fresh --serve build even if SERVE_BUILD_DIR already has one. */
  rebuild: boolean;
};

type Take =
  | { kind: 'tour'; id: TourId; beats: BeatRange }
  // loopFrames set only for a `loop: true` clip — see the frame loop in
  // captureTake, which then stops on frame COUNT instead of polling
  // __recorderTakeStatus.done (never true for a loop; see docs/grill-sessions
  // /record-clip-looping-clips-2026-08-16.md).
  | { kind: 'clip'; id: ClipId; loopFrames: number | undefined };

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
    clipId: undefined,
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
    simTime: undefined,
    serve: false,
    rebuild: false,
  };
  // Tracked separately from options.url: the default url must not trip the
  // --serve/--url conflict check below, only an explicit --url may.
  let urlExplicit = false;
  let positionalSeen = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (arg === '--serve') {
      options.serve = true;
      continue;
    }
    if (arg === '--rebuild') {
      options.rebuild = true;
      continue;
    }
    if (
      arg === '--beats' ||
      arg === '--clip' ||
      arg === '--sim-time' ||
      arg === '--fps' ||
      arg === '--size' ||
      arg === '--dpr' ||
      arg === '--out' ||
      arg === '--url'
    ) {
      const value = argv[++i];
      if (value === undefined) throw new Error(`${arg} requires a value`);
      if (arg === '--beats') options.beats = parseBeatRange(value);
      if (arg === '--clip') options.clipId = value;
      if (arg === '--sim-time') {
        const parsed = Date.parse(value);
        if (Number.isNaN(parsed)) {
          throw new Error(
            "--sim-time must be an ISO 8601 instant like '2026-07-31T12:00:00.000Z', " +
              `got '${value}'`,
          );
        }
        options.simTime = new Date(parsed);
      }
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
      if (arg === '--url') {
        options.url = value.replace(/\/$/, '');
        urlExplicit = true;
      }
    } else if (arg.startsWith('--')) {
      throw new Error(
        `unknown flag '${arg}' ` +
          '(known: --clip, --beats, --sim-time, --fps, --size, --dpr, --out, --url, ' +
          '--serve, --rebuild; positional: tour id)',
      );
    } else if (!positionalSeen) {
      options.tourId = arg;
      positionalSeen = true;
    } else {
      throw new Error(`unexpected extra positional '${arg}' — only one tour id is accepted`);
    }
  }
  if (options.clipId !== undefined && positionalSeen) {
    throw new Error(
      `a take is either a tour or a clip, not both — got tour '${options.tourId}' ` +
        `and --clip ${options.clipId}`,
    );
  }
  if (options.clipId !== undefined && options.beats !== undefined) {
    throw new Error('--beats windows a tour take; a clip take is played whole');
  }
  if (options.serve && urlExplicit) {
    throw new Error(
      '--serve builds and serves its own production copy at a URL it picks — pass --url only ' +
        'when pointing at a server that is already running, not together with --serve',
    );
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
 * --serve support: build a production bundle, serve it with `vite preview`,
 * and record against THAT instead of the dev server. The dev client's HMR
 * websocket is the root cause behind two reload-mid-take bugs this branch
 * fixed (see the addInitScript comment in captureTake) — a production build
 * ships no HMR client at all, so this mode is immune by construction rather
 * than patched around a third variant of the same failure. Recommended for
 * any take long enough to outlast the dev client's patience (module doc:
 * hours for a full 4K tour).
 */

/**
 * Build (or reuse) the --serve bundle. `dataUrl()` reads `VITE_DATA_BASE_URL`
 * at build time to decide between the R2 host and a relative `/data/` path
 * (see cloudLoader.ts); blanking it here — in the CHILD's env only, never
 * process.env — makes the served build fetch the catalog from the symlink
 * ensureDataSymlink sets up, exactly like `npm run dev` does. Blanking
 * VITE_COUNTERSCALE_URL likewise skips injecting the analytics tracker into
 * a take that only ever plays on this machine.
 */
async function ensureServeBuild(dir: string, rebuild: boolean): Promise<void> {
  if (!rebuild && existsSync(`${dir}/index.html`)) {
    console.log(`  reusing existing --serve build at ${dir} (pass --rebuild to force a fresh one)`);
    return;
  }
  console.log(
    `  building --serve bundle into ${dir} ` +
      (rebuild ? '(--rebuild forced) ...' : '(none found yet) ...'),
  );
  const proc = spawn('npx', ['vite', 'build', '--outDir', dir], {
    env: { ...process.env, VITE_DATA_BASE_URL: '', VITE_COUNTERSCALE_URL: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const tailLines: string[] = [];
  const collect = (chunk: Buffer): void => {
    for (const line of chunk.toString().split('\n')) {
      if (line.trim() !== '') tailLines.push(line);
    }
    if (tailLines.length > BUILD_LOG_TAIL_LINES) {
      tailLines.splice(0, tailLines.length - BUILD_LOG_TAIL_LINES);
    }
  };
  proc.stdout?.on('data', collect);
  proc.stderr?.on('data', collect);
  const code = await new Promise<number | null>((resolve, reject) => {
    proc.once('error', (err: NodeJS.ErrnoException) => {
      reject(
        err.code === 'ENOENT'
          ? new Error("'npx' not found on PATH — the --serve build shells out to it")
          : err,
      );
    });
    proc.once('close', resolve);
  });
  if (code !== 0) {
    throw new Error(`vite build exited with code ${String(code)} — tail:\n${tailLines.join('\n')}`);
  }
}

/**
 * Vite's default `copyPublicDir` copies the whole `public/` tree — including
 * `data/`, ~100 MB of catalog `.bin` files, when this worktree has them on
 * disk — into the outDir verbatim on every build. --serve replaces that
 * one-time snapshot with a symlink back at this worktree's public/data/ so
 * a reused build (no --rebuild) still serves whatever the catalog currently
 * is, and so a build doesn't silently double disk usage. Repairs whatever it
 * finds at the link path — a stale symlink (wrong target, or dangling
 * because public/data/ moved), or vite's own copied directory — rather than
 * trusting it.
 */
function ensureDataSymlink(dir: string): void {
  const linkPath = resolvePath(dir, 'data');
  const target = resolvePath('public/data');
  let stat: ReturnType<typeof lstatSync> | undefined;
  try {
    stat = lstatSync(linkPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  if (stat !== undefined) {
    if (stat.isSymbolicLink()) {
      const resolvedExisting = resolvePath(dirname(linkPath), readlinkSync(linkPath));
      if (resolvedExisting === target && existsSync(linkPath)) return; // correct and not dangling
      console.log(`  repairing stale --serve data symlink at ${linkPath}`);
      unlinkSync(linkPath);
    } else {
      console.log(`  replacing vite's copied ${linkPath} with a symlink to keep data current`);
      rmSync(linkPath, { recursive: true, force: true });
    }
  }
  symlinkSync(target, linkPath, 'dir');
  console.log(`  linked ${linkPath} -> ${target}`);
}

type PreviewHandle = {
  proc: ChildProcess;
  /** The URL vite actually bound — see parsePreviewUrl for why this can't be assumed. */
  url: string;
};

/**
 * Spawn `vite preview` over the --serve build and read back the URL it
 * actually bound (strictPort is left off, so a busy SERVE_PORT just bumps —
 * assuming the requested port held would silently record against nothing).
 * Mirrors spawnFfmpeg's spawn/error race for the ENOENT case; the ready wait
 * adds a timeout because there is no bounded "it will definitely print a URL
 * eventually" guarantee the way ffmpeg's close event gives one.
 */
async function spawnPreviewServer(dir: string, port: number): Promise<PreviewHandle> {
  const proc = spawn('npx', ['vite', 'preview', '--outDir', dir, '--port', String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise<void>((resolve, reject) => {
    proc.once('spawn', () => resolve());
    proc.once('error', (err: NodeJS.ErrnoException) => {
      reject(
        err.code === 'ENOENT'
          ? new Error("'npx' not found on PATH — the --serve preview shells out to it")
          : err,
      );
    });
  });
  const url = await new Promise<string>((resolve, reject) => {
    const onData = (chunk: Buffer): void => {
      const found = parsePreviewUrl(chunk.toString());
      if (found !== undefined) {
        clearTimeout(timer);
        proc.stdout?.off('data', onData);
        proc.off('close', onClose);
        resolve(found);
      }
    };
    const onClose = (code: number | null): void => {
      clearTimeout(timer);
      reject(
        new Error(`vite preview exited with code ${String(code)} before printing a 'Local:' URL`),
      );
    };
    const timer = setTimeout(() => {
      proc.stdout?.off('data', onData);
      proc.off('close', onClose);
      reject(new Error(`vite preview gave no 'Local:' URL within ${PREVIEW_READY_TIMEOUT_MS} ms`));
    }, PREVIEW_READY_TIMEOUT_MS);
    proc.stdout?.on('data', onData);
    proc.once('close', onClose);
  });
  return { proc, url };
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
async function awaitCaptureReady(page: Page, captureUrl: string): Promise<void> {
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
        `${captureUrl} — the hook installs only in cinema mode, on a build that ` +
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
 * the take ended — or, for a looping clip (`take.loopFrames` set), until
 * exactly that many frames have been captured, since the status flag never
 * flips for a loop. Returns the number of frames captured. Encoding enters
 * only through the injected writePng, so this function knows nothing about
 * ffmpeg.
 */
async function captureTake(
  browser: Browser,
  options: RecordOptions,
  take: Take,
  /** Composed by main (cinema gate + sim pin) so a bad --url fails before ffmpeg spawns. */
  captureUrl: string,
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
  // Drop Vite's HMR client's 'close' listener on its own websocket, everywhere
  // in the take, boot included. A long virtual-time-paused capture (module
  // header: 4K can cost real seconds per frame) can far outlast whatever
  // keeps that socket alive, and losing it makes the client poll for the
  // server and then `location.reload()` (node_modules/vite/dist/client/
  // client.mjs, the `vite:ws:disconnect` handler) — a real navigation that
  // wipes `__recorderTakeStatus` out from under the frame loop (confirmed by
  // forcibly closing that socket mid-take and observing the exact vanish).
  // `location.reload` itself can't be neutered — Location's operations are
  // unforgeable own properties, so `location.reload = fn` silently no-ops.
  //
  // That fix left one seam open on purpose: Vite's MESSAGE-driven
  // `full-reload` (server → client over the still-open socket) still reached
  // `location.reload()`, because cold-start dependency-optimization recovery
  // needs exactly that path during boot. A forced repro (touching
  // tsconfig.json mid-take pushes `full-reload`) shows the SAME message,
  // arriving mid-take instead of at boot, produces the exact vanish. Below, a
  // page-side flag armed only AFTER `awaitCaptureReady` (never during boot)
  // drops `full-reload` payloads specifically — every other message type,
  // and the boot-time path before the flag is armed, is untouched.
  await context.addInitScript(() => {
    const NativeWebSocket = window.WebSocket;
    window.WebSocket = new Proxy(NativeWebSocket, {
      construct(target, args, newTarget) {
        const instance = Reflect.construct(target, args, newTarget) as WebSocket;
        // The HMR socket alone carries Vite's connection token; every other
        // websocket the app itself opens (none today, but the guard is
        // narrow on purpose) keeps its normal behaviour.
        if (!String(args[0]).includes('token=')) return instance;
        const nativeAddEventListener = instance.addEventListener.bind(instance);
        // Diagnostics, independent of the suppression below: log every HMR
        // message and every native close, so a future vanish names its
        // mechanism instead of leaving the harness guessing. These use
        // the ORIGINAL addEventListener, bypassing the override further
        // down, so they still fire for a message this take goes on to drop.
        nativeAddEventListener('message', ((event: MessageEvent) => {
          try {
            const payload = JSON.parse(String(event.data)) as { type?: string; path?: string };
            console.info(
              `[recorder-diag] hmr message type=${payload.type ?? '?'}` +
                (payload.path !== undefined ? ` path=${payload.path}` : ''),
            );
          } catch {
            // Not a JSON HMR frame (e.g. the 'vite-ping' subprotocol keepalive) — ignore.
          }
        }) as EventListener);
        nativeAddEventListener('close', ((event: CloseEvent) => {
          console.info(
            `[recorder-diag] hmr socket closed code=${event.code} reason=${event.reason}`,
          );
        }) as EventListener);
        instance.addEventListener = ((type: string, listener: unknown, opts?: unknown) => {
          if (type === 'close') return;
          if (type === 'message') {
            const wrapped = (event: MessageEvent) => {
              const w = window as unknown as { __recorderSuppressFullReload?: boolean };
              if (w.__recorderSuppressFullReload === true) {
                try {
                  const payload = JSON.parse(String(event.data)) as { type?: string };
                  if (payload.type === 'full-reload') {
                    console.info('[recorder-diag] suppressed full-reload message during take');
                    return;
                  }
                } catch {
                  // Not a JSON HMR frame — fall through to the real listener.
                }
              }
              (listener as (e: MessageEvent) => void).call(instance, event);
            };
            nativeAddEventListener('message', wrapped as never, opts as never);
            return;
          }
          nativeAddEventListener(type as never, listener as never, opts as never);
        }) as typeof instance.addEventListener;
        return instance;
      },
    });
  });
  const page = await context.newPage();
  // Persistent mid-take diagnostics (round 2): every navigation or vite-client
  // console line gets a timestamped, frame-numbered log line, and the most
  // recent one lands inside the vanish error itself (see the status-poll
  // loop below) so a future failure names what happened instead of just that
  // something did.
  const takeStartedAt = Date.now();
  let framesSoFar = 0;
  let lastDiagLine: string | undefined;
  const logDiag = (label: string, detail: string): void => {
    const line =
      `[diag] t+${((Date.now() - takeStartedAt) / 1000).toFixed(1)}s frame ${framesSoFar}: ` +
      `${label} ${detail}`;
    console.warn(line);
    lastDiagLine = line;
  };
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) logDiag('framenavigated', frame.url());
  });
  page.on('crash', () => logDiag('page crash', '(page.on("crash") fired)'));
  // Surface page-side failures immediately — a dead take should explain
  // itself in the harness output, not require reproducing in a headed run.
  page.on('pageerror', (err) => console.warn(`[page] error: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.warn(`[page] console.error: ${msg.text()}`);
    if (msg.text().startsWith('[vite]') || msg.text().startsWith('[recorder-diag]')) {
      logDiag('console', msg.text());
    }
  });

  console.log(`loading ${captureUrl} ...`);
  await page.goto(captureUrl, { waitUntil: 'load' });

  // Bounded retry around the boot wait: safe ONLY here, in real time before
  // the pause — the reloaded page reinstalls the hook and boots again, and no
  // virtual-time or take state exists yet to lose. Once virtual time is
  // paused (below), a navigation destroys the virtual clock and the running
  // take with it, so the capture loop deliberately has no such tolerance.
  // The suppression flag below is NOT armed yet during this loop — cold-start
  // full-reload recovery must keep working here.
  for (let navigations = 0; ; navigations++) {
    try {
      await awaitCaptureReady(page, captureUrl);
      break;
    } catch (err) {
      if (!isNavigationInterruption(err) || navigations >= MAX_BOOT_NAVIGATIONS) throw err;
      console.warn(
        '[boot] page navigated during the ready wait (expected once on a cold cache: ' +
          "Vite's dependency-optimization reload) — retrying the wait",
      );
    }
  }

  // Arm the mid-take full-reload suppression only now that boot has settled —
  // see the addInitScript comment above for why this can't be armed earlier.
  await page.evaluate(() => {
    (window as unknown as { __recorderSuppressFullReload?: boolean }).__recorderSuppressFullReload =
      true;
  });

  // Pause BEFORE kicking the take — see the module header's choreography
  // section. From here on, page time advances only by explicit grants.
  const session = await context.newCDPSession(page);
  await session.send('Emulation.setVirtualTimePolicy', { policy: 'pause' });

  // Kick the take under paused virtual time (finding 3: evaluate, never a
  // locator action). The evaluate returns immediately — the start promise is
  // deliberately NOT awaited; its outcome lands in __recorderTakeStatus.
  await page.evaluate(
    ({ take: subject }) => {
      const w = window as unknown as RecorderPageWindow;
      const hook = w.__skymapRecorder;
      if (hook === undefined) throw new Error('__skymapRecorder missing');
      const status: TakeStatus = { done: false, error: null };
      w.__recorderTakeStatus = status;
      const started =
        subject.kind === 'tour'
          ? hook.startTour(subject.id, subject.beats)
          : hook.startClip(subject.id);
      started.then(
        () => {
          status.done = true;
        },
        (err: unknown) => {
          status.error = err instanceof Error ? err.message : String(err);
          status.done = true;
        },
      );
    },
    { take },
  );

  // A windowed take (from > 0) opens with the saga's reconstruction fold plus
  // its FOLD_SETTLE_MS delay: the visibility bridge and label-fade envelope
  // animate the folded diff, and the saga holds the first beat until they
  // finish (src/state/tour/foldSettleMs.ts). Burn exactly that much virtual
  // time WITHOUT capturing — grant and discard, no ffmpeg write — so the
  // film's first frame is the settled scene, not the reconstruction dissolve.
  // Full takes skip this: beat 0's fold equals the live baseline. The frame
  // cap below applies to CAPTURED frames only; these discards sit outside it.
  // A clip take has no analogue — its scene cues sit on its own timeline, so
  // burning virtual time here would burn the clip's opening (tools/record/README.md).
  if (take.kind === 'tour' && take.beats.from > 0) {
    const settleFrames = Math.ceil((FOLD_SETTLE_MS / 1000) * options.fps);
    console.log(`settling scene reconstruction: discarding ${settleFrames} frames`);
    for (let settle = 0; settle < settleFrames; settle++) {
      await grantAndAwaitExpiry(session, 1000 / options.fps, `settle ${settle}`);
    }
  }

  // A looping clip's __recorderTakeStatus.done never flips (clipPlayer.tick
  // rewinds instead of dispatching clipEnded) — its stop condition is a plain
  // frame count instead, computed by main() from the compiled duration.
  const loopFrames = take.kind === 'clip' ? take.loopFrames : undefined;
  console.log(
    `stepping at ${(1000 / options.fps).toFixed(2)} ms per frame ` +
      (loopFrames !== undefined
        ? `(looping clip — recording exactly ${loopFrames} frames, one cycle) ...`
        : `(cap ${frameCap} captured frames) ...`),
  );
  let frame = 0;
  while (true) {
    framesSoFar = frame; // keeps the diagnostics above frame-accurate
    // Poll the bridge at the frame boundary (module header: deterministic
    // stop frame). Checked BEFORE granting so a take that ends inside grant N
    // yields exactly N captured frames, the last one showing the final pose.
    const status = await page.evaluate(
      () => (window as unknown as RecorderPageWindow).__recorderTakeStatus,
    );
    if (status === undefined) {
      throw new Error(
        '__recorderTakeStatus vanished — did the page reload mid-take? ' +
          `page.url() now: ${page.url()} · last diagnostic: ` +
          (lastDiagLine ?? '(none — no navigation/console signal was observed before this)'),
      );
    }
    if (status.error !== null) {
      throw new Error(`the take's start promise rejected in-page: ${status.error}`);
    }
    if (loopFrames !== undefined) {
      if (frame >= loopFrames) break;
    } else {
      if (status.done) break;
      if (frame >= frameCap) {
        throw new Error(
          `aborting at frame ${frame}: cap ${frameCap} exceeded and '${take.kind} ${take.id}' ` +
            'has not ended — likely something stuck on a waitUntil readiness gate (catalog focus ' +
            'never loaded?). Check the [page] warnings above.',
        );
      }
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
    if (frame % PROGRESS_EVERY_FRAMES === 0) {
      console.log(`  frame ${frame} / ${loopFrames ?? frameCap}`);
    }
  }

  // No explicit in-page stop for the loop-frame-count exit: context.close()
  // below tears down the page (and the still-running clip with it), same as
  // any other take that leaves virtual time behind after its last frame.
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

  // --serve stands up its own production server and points the rest of main
  // at it — everything from here down (through the DONE banner) runs inside
  // a try/finally purely to guarantee this child is killed on every path out
  // of main, success or failure, without duplicating a kill call at each of
  // the several places the ffmpeg block below already handles its own child.
  let preview: PreviewHandle | undefined;
  if (options.serve) {
    console.log('record — --serve: self-hosting a production build for this take');
    await ensureServeBuild(SERVE_BUILD_DIR, options.rebuild);
    ensureDataSymlink(SERVE_BUILD_DIR);
    preview = await spawnPreviewServer(SERVE_BUILD_DIR, SERVE_PORT);
    options.url = preview.url;
    console.log(`  serving at ${preview.url} (no dev-client HMR — immune to reload-mid-take)`);
  }
  try {
    // The pin is the SIM clock, resolved once before anything spawns so the URL
    // and the banner name the same instant (module header: two clocks).
    const simTime = options.simTime ?? new Date();
    const captureUrl = buildCaptureUrl({ base: options.url, simTime });

    // Resolve the subject up front so an id typo fails before any process spawns.
    let take: Take;
    let frameCap: number;
    let subjectLine: string;
    // Set only for a `loop: true` clip; printed after the banner below and
    // threaded onto `take` so captureTake's frame loop can stop on count
    // instead of polling the never-resolving clip-end status.
    let loopNote: string | undefined;
    if (options.clipId !== undefined) {
      const clip = (clipRegistry as Record<string, Clip>)[options.clipId];
      if (clip === undefined) {
        throw new Error(
          `unknown clip '${options.clipId}' — known: ${Object.keys(clipRegistry).join(', ')}`,
        );
      }
      // The J2000 snapshot is the right source for the cap: only a clip's START
      // POSE depends on the instant, its authored durations do not.
      frameCap = clipFrameCap(clip.data, options.fps);
      subjectLine = `clip '${clip.id}' — ${clip.label}`;

      let loopFrames: number | undefined;
      if (clip.data.loop === true) {
        const durationSec = clipDurationSec(clip.data);
        loopFrames = loopCycleFrameCount(durationSec, options.fps);
        loopNote = `looping clip — recording one seamless cycle (${loopFrames} frames)`;
        // Q4 (grill session): duration × fps need not land on the frame grid —
        // round rather than error, and say so.
        const exactFrames = durationSec * options.fps;
        if (!Number.isInteger(exactFrames)) {
          const seamOffsetMs = ((loopFrames - exactFrames) / options.fps) * 1000;
          loopNote +=
            `\n  note: ${durationSec}s × ${options.fps}fps = ${exactFrames} is not a whole ` +
            `number of frames — rounded to ${loopFrames}, a ${seamOffsetMs.toFixed(2)} ms seam offset`;
        }
      }
      take = { kind: 'clip', id: clip.id, loopFrames };
    } else {
      const tour = (tourRegistry as Record<string, Tour>)[options.tourId];
      if (tour === undefined) {
        throw new Error(
          `unknown tour '${options.tourId}' — known: ${Object.keys(tourRegistry).join(', ')}`,
        );
      }
      const beats: BeatRange = options.beats ?? { from: 0, to: tour.beats.length - 1 };
      // The cap helper sums whatever slice it is given; slicing to the requested
      // range here is the caller contract its docstring names. Beat indices are
      // the 0-based '#' column of `npm run tour-length`.
      const slicedBeats = tour.beats.slice(beats.from, beats.to + 1);
      if (slicedBeats.length === 0) {
        throw new Error(
          `--beats ${beats.from}..${beats.to} selects no beats — '${tour.id}' has ` +
            `${tour.beats.length} beats (indices 0..${tour.beats.length - 1}; ` +
            "see 'npm run tour-length')",
        );
      }
      take = { kind: 'tour', id: tour.id, beats };
      frameCap = tourFrameCap(slicedBeats, options.fps);
      subjectLine =
        `tour '${tour.id}' beats ${beats.from}..${beats.to} ` +
        `(${slicedBeats.length} of ${tour.beats.length})`;
    }

    // Default output name = take + size + fps + timestamp, so successive
    // default-flag takes (or a smoke against a different tour) never silently
    // overwrite a previous film — ffmpeg runs -y. An explicit --out is exact
    // and CAN overwrite: a fixed name is then the operator's stated intent.
    // The banner below prints the resolved path either way.
    const out =
      options.out ??
      defaultOutName({
        takeId: take.id,
        width: options.size.width,
        height: options.size.height,
        fps: options.fps,
        now: new Date(),
      });

    console.log(`record — ${subjectLine}`);
    console.log(
      `  ${options.size.width}x${options.size.height} @ ${options.fps} fps ` +
        `(viewport ${options.size.width / options.dpr}x${options.size.height / options.dpr} ` +
        `@ dpr ${options.dpr}) → ${out}`,
    );
    console.log(
      `  sim time pinned: ${simTime.toISOString()}  ` +
        `(re-take with --sim-time ${simTime.toISOString()})`,
    );
    if (loopNote !== undefined) console.log(loopNote);

    // ffmpeg first: a missing binary should fail in milliseconds, not after a
    // browser launch and a full app boot.
    const ffmpeg = await spawnFfmpeg(options.fps, out);
    let frames: number;
    try {
      const browser = await launchChromium();
      try {
        frames = await captureTake(browser, options, take, captureUrl, frameCap, (png) =>
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
    console.log(
      `  captured frames: ${frames}  ` +
        (take.kind === 'clip' && take.loopFrames !== undefined
          ? '(one seamless cycle)'
          : `(cap was ${frameCap})`),
    );
    console.log(`  ffprobe: ${probe.width}x${probe.height}, nb_frames ${probe.nbFrames}`);
  } finally {
    if (preview !== undefined && preview.proc.exitCode === null) preview.proc.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
