/**
 * virtualTimeSpike — the GATE spike for the tour recorder pipeline.
 *
 * ### Why this exists
 *
 * The tour-recorder design (docs/superpowers/specs/2026-07-07-tour-recorder-design.md,
 * "Risks and the spike gate") rests on one genuinely unproven combination:
 * CDP **virtual time** stepping × **WebGPU presentation** on this app. The two
 * halves are individually proven — headless WebGPU + screenshots works (the
 * e2e suite, tests/e2e/cf4-density-volume.spec.ts), and virtual time + canvas
 * stepping is the mechanism behind timecut-class capture tools — but nobody
 * has shown that on skymap each budget grant reliably fires rAF → the render
 * scheduler → runFrame → submit → *present* before the per-frame screenshot
 * composites. If presentation lags a grant, every captured frame shows the
 * previous frame's pixels (or a frozen canvas), and the whole recorder
 * architecture needs its named fallback before Task 4 builds the real harness.
 *
 * ### What the two assertions prove
 *
 * (a) MOTION — with camera auto-rotate on, consecutive screenshots within one
 *     run must differ (mean absolute RGB diff above a small noise floor for
 *     most pairs). This proves each budget grant produced a *new* presented
 *     frame — the canvas is stepping, not frozen or lagging.
 *
 * (b) DETERMINISM — two full runs in fresh browser contexts must produce
 *     near-equal images frame-for-frame (frame N of run 1 vs frame N of
 *     run 2). This proves the virtual clock, not wall time, drives what ends
 *     up in each frame — the property the recorder needs so a re-take of the
 *     same beats yields the same film.
 *
 * ### Why near-equal, not byte-equal
 *
 * GPU float accumulation wiggles low bits: rasterization order, blending, and
 * driver-level reassociation are not bit-stable across runs. The acceptance
 * bar is *visual* identity, so the comparison decodes PNGs to raw RGBA (via
 * sharp) and thresholds the mean absolute per-channel difference on the 0-255
 * scale. A residual cross-run difference can also come from any shader
 * animation phased on *absolute* time (virtual clocks start from the wall
 * clock at pause, so absolute timestamps differ between runs even though
 * elapsed intervals match) — the printed per-frame table lets a human judge
 * whether a borderline number is float wiggle or a real wall-clock leak.
 *
 * ### Choreography notes (why the odd ordering below)
 *
 * - Boot happens in REAL time (networkidle + the engine's upload-done console
 *   log + a settle pause). Virtual time is not engaged during bootstrap, and
 *   the settle pause lets the ~600 ms catalog load-fades finish so run 1 and
 *   run 2 don't diverge on fade alpha stamped at slightly different real
 *   moments.
 * - Virtual time is paused BEFORE auto-rotate is switched on. The auto-rotate
 *   pose is a pure function of elapsed-time-since-activation (see
 *   src/services/engine/camera/cameraClock.ts), and the activation timestamp
 *   is captured on the first frame after the toggle. Pausing first means that
 *   first frame runs under virtual time, so frame k sits at exactly
 *   k x budget ms of rotation in BOTH runs. Toggling before pausing would let
 *   a nondeterministic sliver of real-time rotation leak into the start pose.
 * - The toggle click is dispatched via page.evaluate (a plain DOM click), not
 *   a Playwright locator click: Playwright's actionability checks await
 *   element stability via rAF, which never fires while virtual time is
 *   paused with no budget — a locator click would deadlock.
 * - Frames are captured with raw CDP Page.captureScreenshot, not Playwright's
 *   page.screenshot(): the latter runs a readiness dance (font waits,
 *   rAF-driven stability checks) that can stall indefinitely once the
 *   virtual-time budget is exhausted — observed as a 30 s hang at 'taking
 *   page screenshot'. The raw command grabs the compositor surface with no
 *   page-side waiting.
 * - The app is loaded at /?tour=x: the 'tour' query key is a deep link that
 *   suppresses the splash on a fresh profile (src/utils/url/hasDeepLink.ts).
 *   It does not auto-start anything.
 *
 * ### Fallback switch
 *
 * --extra-grant enables the spec's fallback #1: one additional near-zero
 * budget grant before each screenshot, giving the compositor an extra
 * lifecycle to absorb present lag without meaningfully advancing app time.
 * Default off; flip it on if assertion (a) fails with frozen/duplicate
 * frames. If (a) still fails with the flag on, the remaining fallback is an
 * explicit per-frame present handshake in the recorder hook (Task 4) — not
 * built here.
 *
 * ### Run
 *
 *   npm run spike-virtual-time -- --url http://localhost:5173
 *
 * Flags: --url <base> (default http://localhost:5173, dev server must already
 * be running), --frames <n> (default 120), --out <dir> (default: fresh dir
 * under the OS tmpdir, printed at the end), --extra-grant (default off).
 * Screenshots land in <out>/run1/ and <out>/run2/ for eyeballing; exit code
 * is non-zero if either assertion fails.
 */

import { chromium, type Browser, type Page } from '@playwright/test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { grantAndAwaitExpiry } from './grantAndAwaitExpiry';

// 640x360 keeps screenshot latency low; the recorder itself will run larger.
const VIEWPORT = { width: 640, height: 360 };
// One 60 fps frame of virtual time per grant — the recorder's cadence.
const FRAME_BUDGET_MS = 1000 / 60;
// Near-zero budget for the --extra-grant fallback: enough to pump a frame
// lifecycle, small enough that app-visible time barely advances.
const EXTRA_GRANT_BUDGET_MS = 0.01;
// Assertion (a): a consecutive pair "moves" if its mean abs RGB diff exceeds
// this floor, and more than this fraction of pairs must move.
const MOTION_FLOOR = 0.05;
const MOTION_PAIR_FRACTION = 0.8;
// Assertion (b): mean over frames of the cross-run mean abs diff must sit
// below this (0-255 scale). Tight on purpose — the numbers are printed either
// way so a borderline result can be judged by a human.
const DETERMINISM_MEAN_THRESHOLD = 1.0;
// Real-time boot waits.
const UPLOAD_LOG_TIMEOUT_MS = 30_000;
const BOOT_SETTLE_MS = 3_000;

const AUTO_ROTATE_SELECTOR = 'button[aria-label="Start camera auto-rotate"]';

type SpikeOptions = {
  url: string;
  frames: number;
  out: string;
  extraGrant: boolean;
};

/**
 * Bespoke argv loop rather than tools/utils/cli/args.ts: parseFlags is
 * deliberately boolean-only, and its own docstring keeps string/number-valued
 * flags in per-script loops.
 */
function parseArgs(argv: readonly string[]): SpikeOptions {
  const options: SpikeOptions = {
    url: 'http://localhost:5173',
    frames: 120,
    out: '',
    extraGrant: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--url' || arg === '--frames' || arg === '--out') {
      const value = argv[++i];
      if (value === undefined) throw new Error(`${arg} requires a value`);
      if (arg === '--url') options.url = value.replace(/\/$/, '');
      if (arg === '--out') options.out = value;
      if (arg === '--frames') {
        options.frames = Number(value);
        if (!Number.isInteger(options.frames) || options.frames < 2) {
          throw new Error(`--frames must be an integer >= 2, got '${value}'`);
        }
      }
    } else if (arg === '--extra-grant') {
      options.extraGrant = true;
    } else {
      throw new Error(`unknown flag '${arg}' (known: --url, --frames, --out, --extra-grant)`);
    }
  }
  if (options.out === '') {
    options.out = mkdtempSync(join(tmpdir(), 'skymap-virtual-time-spike-'));
  }
  return options;
}

type ConsoleLog = { lines: string[]; pageErrors: string[] };

function watchConsole(page: Page): ConsoleLog {
  const log: ConsoleLog = { lines: [], pageErrors: [] };
  page.on('console', (msg) => log.lines.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => log.pageErrors.push(err.message));
  return log;
}

/** Poll (in real time — only used pre-pause) for a console line containing substr. */
async function waitForConsoleLine(
  log: ConsoleLog,
  substr: string,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (log.lines.some((l) => l.includes(substr))) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

// Virtual-time stepping: grantAndAwaitExpiry.ts carries the CDP invariants.

/**
 * One full capture run in a fresh browser context: boot in real time, pause
 * virtual time, switch auto-rotate on, then step frames x budget grants with
 * a screenshot after each. Returns the screenshot paths in frame order.
 */
async function captureRun(
  browser: Browser,
  options: SpikeOptions,
  runDir: string,
  runLabel: string,
): Promise<{ framePaths: string[]; log: ConsoleLog }> {
  mkdirSync(runDir, { recursive: true });
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const log = watchConsole(page);

  console.log(`[${runLabel}] loading ${options.url}/?tour=x ...`);
  await page.goto(`${options.url}/?tour=x`, { waitUntil: 'networkidle' });

  // Engine-ready signal: the first catalog upload-done log. On timeout we
  // warn and continue — a worktree without linked data boots on the synthetic
  // fallback, and the motion assertion will catch a genuinely dead scene.
  const sawUpload = await waitForConsoleLine(log, '[engine] upload done', UPLOAD_LOG_TIMEOUT_MS);
  if (!sawUpload) {
    console.warn(
      `[${runLabel}] WARNING: no '[engine] upload done' log within ${UPLOAD_LOG_TIMEOUT_MS} ms`,
    );
    console.warn(`[${runLabel}] captured console so far:`);
    for (const line of log.lines) console.warn(`  ${line}`);
  }
  await page.waitForSelector(AUTO_ROTATE_SELECTOR, { timeout: 10_000 });
  // Let load-fades (~600 ms) finish in real time so both runs pause on a
  // fully settled scene.
  await page.waitForTimeout(BOOT_SETTLE_MS);

  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setVirtualTimePolicy', { policy: 'pause' });

  // Plain DOM click under paused virtual time — see the module header for
  // why a Playwright locator click would deadlock here.
  await page.evaluate((selector) => {
    const button = document.querySelector<HTMLButtonElement>(selector);
    if (!button) throw new Error(`auto-rotate pill not found (${selector})`);
    button.click();
  }, AUTO_ROTATE_SELECTOR);

  console.log(
    `[${runLabel}] stepping ${options.frames} frames x ${FRAME_BUDGET_MS.toFixed(2)} ms` +
      (options.extraGrant ? ` (+${EXTRA_GRANT_BUDGET_MS} ms extra grant before each shot)` : ''),
  );
  const framePaths: string[] = [];
  for (let frame = 0; frame < options.frames; frame++) {
    await grantAndAwaitExpiry(session, FRAME_BUDGET_MS, `${runLabel} frame ${frame}`);
    if (options.extraGrant) {
      const label = `${runLabel} frame ${frame} extra`;
      await grantAndAwaitExpiry(session, EXTRA_GRANT_BUDGET_MS, label);
    }
    const framePath = join(runDir, `frame-${String(frame).padStart(4, '0')}.png`);
    // Raw CDP capture, not page.screenshot() — see the module header. The
    // fromSurface flag reads the compositor surface (what the display would
    // show), which is exactly the presentation question this spike answers.
    const shot = await session.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
    });
    writeFileSync(framePath, Buffer.from(shot.data, 'base64'));
    framePaths.push(framePath);
    if ((frame + 1) % 20 === 0) console.log(`[${runLabel}]   ${frame + 1}/${options.frames}`);
  }

  await context.close();
  return { framePaths, log };
}

type RawFrame = { data: Buffer; width: number; height: number };

async function loadRaw(path: string): Promise<RawFrame> {
  const { data, info } = await sharp(path)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/**
 * Mean absolute per-channel difference over RGB (alpha excluded — screenshots
 * are fully opaque, and a constant-zero channel would dilute the mean by a
 * quarter), on the 0-255 scale.
 */
function meanAbsDiffRgb(a: RawFrame, b: RawFrame): number {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`frame size mismatch: ${a.width}x${a.height} vs ${b.width}x${b.height}`);
  }
  const pixels = a.width * a.height;
  let sum = 0;
  for (let px = 0; px < pixels; px++) {
    const i = px * 4;
    sum +=
      Math.abs((a.data[i] ?? 0) - (b.data[i] ?? 0)) +
      Math.abs((a.data[i + 1] ?? 0) - (b.data[i + 1] ?? 0)) +
      Math.abs((a.data[i + 2] ?? 0) - (b.data[i + 2] ?? 0));
  }
  return sum / (pixels * 3);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  console.log('virtual-time spike — CDP virtual time x WebGPU presentation');
  console.log(
    `  url: ${options.url}   frames: ${options.frames}   extra-grant: ${options.extraGrant}`,
  );
  console.log(`  out: ${options.out}`);

  // channel 'chromium' selects Playwright's FULL Chromium build under new
  // headless, where WebGPU works with no flags (empirically verified: an
  // apple metal-3 adapter comes up). The default headless build is the
  // headless SHELL, which exposes navigator.gpu but yields NO adapter — the
  // playwright.config.ts claim that the bundled headless Chromium has WebGPU
  // by default is stale on that point. If this channel is not installed
  // (npx playwright install chromium), the known-working fallback is the
  // shell with args ['--enable-unsafe-webgpu', '--use-angle=metal'].
  // Deliberately NO launch fallback here (unlike record.ts's launchChromium):
  // the spike diagnoses the canonical channel path, so it must fail on it.
  const browser = await chromium.launch({ channel: 'chromium' });
  let run1: Awaited<ReturnType<typeof captureRun>>;
  let run2: Awaited<ReturnType<typeof captureRun>>;
  try {
    run1 = await captureRun(browser, options, join(options.out, 'run1'), 'run1');
    run2 = await captureRun(browser, options, join(options.out, 'run2'), 'run2');
  } finally {
    await browser.close();
  }

  for (const [label, log] of [
    ['run1', run1.log],
    ['run2', run2.log],
  ] as const) {
    if (log.pageErrors.length > 0) {
      console.warn(`[${label}] page errors during capture:`);
      for (const err of log.pageErrors) console.warn(`  ${err}`);
    }
  }

  console.log('decoding frames ...');
  const frames1 = await Promise.all(run1.framePaths.map(loadRaw));
  const frames2 = await Promise.all(run2.framePaths.map(loadRaw));

  // Per-frame diff table: motion = run1 frame i vs i+1; cross = run1 vs run2
  // at frame i. Printed in full so a borderline verdict can be inspected.
  const motionDiffs: number[] = [];
  const crossDiffs: number[] = [];
  console.log('\nframe | motion (run1 i vs i+1) | cross-run (run1 vs run2 at i)');
  console.log('------+------------------------+------------------------------');
  for (let i = 0; i < options.frames; i++) {
    const a1 = frames1[i];
    const a2 = frames2[i];
    if (a1 === undefined || a2 === undefined) throw new Error(`missing decoded frame ${i}`);
    const cross = meanAbsDiffRgb(a1, a2);
    crossDiffs.push(cross);
    const next = frames1[i + 1];
    let motionCell = '        —';
    if (next !== undefined) {
      const motion = meanAbsDiffRgb(a1, next);
      motionDiffs.push(motion);
      motionCell = motion.toFixed(4).padStart(9);
    }
    console.log(`${String(i).padStart(5)} | ${motionCell.padEnd(22)} | ${cross.toFixed(4)}`);
  }

  // Assertion (a) — motion.
  const movingPairs = motionDiffs.filter((d) => d > MOTION_FLOOR).length;
  const movingFraction = movingPairs / motionDiffs.length;
  const motionPass = movingFraction > MOTION_PAIR_FRACTION;

  // Assertion (b) — determinism.
  const crossMean = crossDiffs.reduce((s, d) => s + d, 0) / crossDiffs.length;
  const crossMax = Math.max(...crossDiffs);
  const determinismPass = crossMean < DETERMINISM_MEAN_THRESHOLD;

  console.log('');
  console.log(
    `ASSERTION (a) MOTION: ${motionPass ? 'PASS' : 'FAIL'} — ` +
      `${movingPairs}/${motionDiffs.length} consecutive pairs ` +
      `(${(movingFraction * 100).toFixed(1)}%) exceed floor ${MOTION_FLOOR} ` +
      `(need > ${MOTION_PAIR_FRACTION * 100}%)`,
  );
  console.log(
    `ASSERTION (b) DETERMINISM: ${determinismPass ? 'PASS' : 'FAIL'} — ` +
      `cross-run mean abs diff: mean ${crossMean.toFixed(4)}, max ${crossMax.toFixed(4)} ` +
      `(need mean < ${DETERMINISM_MEAN_THRESHOLD})`,
  );
  console.log(
    `\nscreenshots: ${options.out}  (run1/ and run2/ — eyeball a few for caption/text sanity)`,
  );

  if (!motionPass || !determinismPass) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
