/**
 * probeGpuErrors — headless WebGPU *error* probe for the galaxy-renderer tool.
 *
 *   npx tsx tools/galaxy-renderer/probeGpuErrors.ts   # or: npm run galaxy-renderer:probe
 * No test in the repo can reach this tool's engine, so nothing but a human
 * eyeballing the canvas catches a bind group built against a destroyed
 * texture, a uniform buffer too small for its struct, or a shader that stops
 * linking. This drives the real UI in real Chromium and reports what the GPU
 * itself complained about. It judges NOTHING about the picture — errors only
 * — plus one numeric exception: `readback:ringMeans` below, which diffs a
 * real GPU compute output against its CPU reference (no headless WebGPU
 * runtime exists in this repo — see the plan's Task 5 for why this one
 * check rides the error probe instead of its own harness).
 */

import {
  chromium,
  type Browser,
  type Locator,
  type Page,
  type ConsoleMessage,
} from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import type { GalaxyEngineHandle } from './@types/engine/GalaxyEngineHandle';
import type { GalaxyIsmMap } from '../../src/@types/galaxy/GalaxyIsmMap';
import type { GalaxyDescription } from '../../src/@types/galaxy/GalaxyDescription';
import type { GalaxyFieldArmRecord } from '../../src/@types/galaxy/GalaxyFieldArmRecord';
import type { GalaxyFieldTuning } from '../../src/@types/galaxy/GalaxyFieldTuning';
import { ismMapRingMeans } from '../../src/utils/galaxy/ismMapRingMeans';
import { buildIsmMapDustCdf } from '../../src/utils/galaxy/buildIsmMapDustCdf';
import { ismMapRingIndexForRadius } from '../../src/utils/galaxy/ismMapRingIndexForRadius';
import { arrayMean } from '../../src/utils/math/arrayMean';
import {
  armRidgeAngle,
  armFadeEnvelope,
  armCrossSigma,
  armRidgeFrameAt,
  armExcessSurfaceShape,
  armColor,
} from '../../src/services/engine/galaxyGenerator/v2/armRidgeGeometry';
import { describeGalaxy } from '../../src/services/engine/galaxyGenerator/shared/describeGalaxy';
import { MILKY_WAY_GALAXY_PARAMS } from '../../src/data/milkyWay/milkyWayGalaxyParams';
import { DEFAULT_GALAXY_DUST_PARAMS } from '../../src/services/engine/galaxyGenerator/v2/defaultGalaxyDustParams';
import { DEFAULT_GALAXY_FIELD_TUNING } from '../../src/services/engine/galaxyGenerator/v2/galaxyFieldMixture';
import { buildArmSpurs } from '../../src/services/engine/galaxyGenerator/v2/armSpurGeometry';
import { deriveArmSpurCloudCount } from '../../src/services/engine/galaxyGenerator/v2/armSpurParticleCloud';
import { computePlaceDustBudget } from './src/engine/ismMap/computePlaceDustBudget';
import { FIELD_COMPONENT_FLOATS } from './src/engine/field/packFieldUniforms';

const VIEWPORT = { width: 1400, height: 900 };
// A control change reaches the GPU through store → engineBridge → the next rAF,
// so every step lets a few frames encode before its errors are drained.
const SETTLE_FRAMES = 6;
// Between two sliders of the same section, where the step's own settle at the
// end is the backstop — a section holds up to six of them.
const NUDGE_FRAMES = 2;
const BOOT_TIMEOUT_MS = 60_000;
// `readback:ringMeans`'s max-|CPU-GPU| budget for one ring's dust mean.
// Measured 1.19e-7 at boot's default preset (float32 tree-reduction sum
// order vs. the CPU's sequential one, over the SAME f16-decoded texels) —
// see task-5-report.md for the run. 1e-3 leaves ~8000x headroom for a
// different preset's larger sums while still catching a genuinely wrong
// computation (e.g. a channel swap), not just reduction-order noise.
const RING_MEANS_TOLERANCE = 1e-3;

// `readback:armRidgeSample`'s max-|CPU-GPU| budget — armRidge.wesl's
// armRidgeAngle/armFadeEnvelope/armCrossSigma/armRidgeFrameAt/
// armExcessSurfaceShape/armColor vs. armRidgeGeometry.ts's own CPU output at
// the SAME literal fixture (armRidgeDebugSample.wesl's own consts, mirrored
// below). f32 vs. f64 trig/exp over small inputs, so this tolerance is
// generous next to RING_MEANS_TOLERANCE's summed-value budget.
const ARM_RIDGE_SAMPLE_TOLERANCE = 1e-4;

// `readback:ismMapDustCdfScan`'s max-|CPU-GPU| budget — ismMapDustCdfScan.wesl's
// dust-weight prefix sum vs. buildIsmMapDustCdf.ts's own CPU loop, over the
// SAME small (4x8) fixture map (createIsmMapDustCdfScanDebugSample.ts). The
// two sum in different orders (GPU: Hillis-Steele within a ring, sequential
// ring-to-ring; CPU: sequential throughout, in f64) — expect float noise,
// not agreement; this budget is a smaller-map analogue of
// RING_MEANS_TOLERANCE's summed-value one, not ARM_RIDGE_SAMPLE_TOLERANCE's
// per-invocation trig/exp one.
const ISM_MAP_DUST_CDF_SCAN_TOLERANCE = 1e-3;

/**
 * CollapsibleSection UNMOUNTS its body when closed, so a section left folded
 * is a section this probe has never run. Its header button is the only
 * disclosure control in the panel, and `aria-expanded` is what marks it —
 * enumerating that instead of a list of titles is what keeps a section added
 * next month from being silently uncovered. A nested sub-section (composed
 * inside another CollapsibleSection's body, via the `nested` prop) uses this
 * SAME selector — discovery below is recursive and scoped per-section, not
 * a single flat page-wide list.
 */
const SECTION_HEADER = 'button[aria-expanded]';
/**
 * The root sweep's seed list only: `data-nested` (set by the `nested` prop)
 * excludes a nested header here, so a sub-section whose parent already
 * defaults open doesn't get queued twice — once as if it were top-level,
 * once (correctly) a moment later from its parent's own body scan.
 */
const TOP_LEVEL_SECTION_HEADER = 'button[aria-expanded]:not([data-nested])';

/** One `uncapturederror` / device-loss entry, tagged with the step that provoked it. */
type GpuErrorEntry = { kind: string; message: string; step: string };

/** What the page-side probe collects; drained after every step. */
type PageProbe = {
  errors: { kind: string; message: string }[];
  adapters: {
    vendor: string;
    architecture: string;
    device: string;
    description: string;
    isFallbackAdapter: boolean;
  }[];
};

/** A step may DISCOVER further steps; they run next, each with its own error tag. */
type ExerciseStep = { name: string; run: (page: Page) => Promise<readonly ExerciseStep[] | void> };

/** One collapsible section the sweep found. `sliders` stays null if its step never got there. */
type SectionRow = { title: string; sliders: number | null };

type ProbeOptions = {
  /** Escape hatch only. Empty = self-host, which is the point (see startDevServer). */
  url: string;
  headed: boolean;
};

function parseArgs(argv: readonly string[]): ProbeOptions {
  const options: ProbeOptions = { url: '', headed: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--headed') {
      options.headed = true;
    } else if (arg === '--url') {
      const value = argv[++i];
      if (value === undefined) throw new Error('--url requires a value');
      options.url = value.replace(/\/$/, '');
    } else {
      throw new Error(`unknown flag '${arg}' (known: --url, --headed)`);
    }
  }
  return options;
}

function findFreePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const socket = createNetServer();
    socket.on('error', reject);
    socket.listen(0, '127.0.0.1', () => {
      const address = socket.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      socket.close(() => resolvePort(port));
    });
  });
}

/**
 * Start the tool's OWN Vite server on an ephemeral port.
 *
 * Pointing at an already-running server is the documented worktree trap
 * (tools/perf/README.md): the branch you measure is whichever branch that
 * server was started from, and nothing says so. Self-hosting makes the probe
 * structurally incapable of testing someone else's checkout.
 */
async function startDevServer(): Promise<{ server: ViteDevServer; url: string }> {
  const configFile = fileURLToPath(new URL('./vite.config.ts', import.meta.url));
  const server = await createServer({
    configFile,
    logLevel: 'warn',
    // An OS-assigned port, asked for out-of-band: Vite reads `port: 0` as
    // "unset" and silently serves on its 5173 default instead — which is the
    // main app's port, the one address this probe must never end up on.
    server: { port: await findFreePort(), strictPort: false },
  });
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (url === undefined) throw new Error('vite dev server started but resolved no local URL');
  return { server, url: url.replace(/\/$/, '') };
}

/**
 * Launch pattern mirrored from measurePerf/recordTour: the 'chromium' channel
 * first (full build, WebGPU with no flags), falling back to the headless shell
 * with the WebGPU flags only if the channel is not installed. The default
 * headless shell exposes navigator.gpu but yields NO adapter, so a probe that
 * silently landed there would pass by never rendering anything.
 */
async function launchChromium(headed: boolean): Promise<Browser> {
  try {
    return await chromium.launch({ channel: 'chromium', headless: !headed });
  } catch (err) {
    console.warn(
      `chromium channel launch failed (${err instanceof Error ? err.message.split('\n')[0] : String(err)})`,
    );
    console.warn(
      "falling back to the headless shell with '--enable-unsafe-webgpu --use-angle=metal'; " +
        "prefer 'npx playwright install chromium' for the proven full-build path",
    );
    return chromium.launch({
      headless: !headed,
      args: ['--enable-unsafe-webgpu', '--use-angle=metal'],
    });
  }
}

/**
 * The load-bearing hook, installed before a single page script runs: the engine
 * creates its device internally, so patching `GPUAdapter.prototype` is the only
 * way to reach it. `uncapturederror` is WHERE WebGPU validation failures
 * surface — un-listened-to they are a console line nobody reads.
 *
 * A `device.lost` with reason 'destroyed' is the engine's own dispose and is
 * deliberately dropped; any other reason is a crash.
 */
async function installGpuProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const probe = { errors: [], adapters: [] } as PageProbe;
    (globalThis as unknown as { __gpuProbe: PageProbe }).__gpuProbe = probe;
    if (typeof navigator === 'undefined' || navigator.gpu === undefined) return;

    const gpu = navigator.gpu;
    const requestAdapter = gpu.requestAdapter.bind(gpu);
    gpu.requestAdapter = async (options?: GPURequestAdapterOptions) => {
      const adapter = await requestAdapter(options);
      if (adapter) {
        const info = adapter.info ?? ({} as GPUAdapterInfo);
        probe.adapters.push({
          vendor: info.vendor ?? '',
          architecture: info.architecture ?? '',
          device: info.device ?? '',
          description: info.description ?? '',
          isFallbackAdapter:
            (adapter as GPUAdapter & { isFallbackAdapter?: boolean }).isFallbackAdapter === true,
        });
      }
      return adapter;
    };

    const requestDevice = GPUAdapter.prototype.requestDevice;
    // Anonymous on purpose, here and in every callback below: a NAMED function
    // inside browser-bound code compiles (under tsx/esbuild `keepNames`) to a
    // call to a `__name` helper that exists only in the Node bundle, so the
    // page dies with `ReferenceError: __name is not defined`.
    GPUAdapter.prototype.requestDevice = async function (
      this: GPUAdapter,
      descriptor?: GPUDeviceDescriptor,
    ): Promise<GPUDevice> {
      const device = await requestDevice.call(this, descriptor);
      device.addEventListener('uncapturederror', (event) => {
        const error = (event as GPUUncapturedErrorEvent).error;
        const kind =
          error instanceof GPUValidationError
            ? 'validation'
            : error instanceof GPUOutOfMemoryError
              ? 'out-of-memory'
              : error instanceof GPUInternalError
                ? 'internal'
                : 'unknown';
        probe.errors.push({ kind, message: error.message });
      });
      void device.lost.then((info) => {
        if (info.reason === 'destroyed') return;
        probe.errors.push({ kind: 'device-lost', message: `${info.reason}: ${info.message}` });
      });
      return device;
    };
  });
}

/** Take everything the page-side probe has collected so far, tagged with `step`. */
async function drainGpuErrors(page: Page, step: string): Promise<GpuErrorEntry[]> {
  const drained = await page.evaluate(() => {
    const probe = (globalThis as unknown as { __gpuProbe?: PageProbe }).__gpuProbe;
    if (!probe) return [];
    return probe.errors.splice(0, probe.errors.length);
  });
  return drained.map((entry) => ({ ...entry, step }));
}

/**
 * Let `count` animation frames encode and present — one round-trip per frame
 * rather than a page-side loop, because a self-referencing `tick` would need a
 * name and names don't survive the trip into the page (see installGpuProbe).
 */
async function settleFrames(page: Page, count: number): Promise<void> {
  for (let frame = 0; frame < count; frame++) {
    await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => done())));
  }
}

/** Drive a `role="slider"` pill by keyboard — Slider.tsx has no native input to set. */
async function pressSlider(page: Page, label: string, keys: readonly string[]): Promise<void> {
  const slider = page.getByRole('slider', { name: label, exact: true });
  for (const key of keys) await slider.press(key);
}

/**
 * Every section header inside `scope`. `scope.locator(selector)` is a
 * DESCENDANT query, so this alone is not a "one level" list — a `group`
 * section's body (ANALYTIC MODEL, LEGACY MODEL) hands back headers at every
 * depth beneath it, not just its own members, because a group member is
 * deliberately not `data-nested` (see CollapsibleSection.tsx). Pair with
 * `filterDirectHeaders` at every call site to trim that back to one level.
 * The chevron glyph is part of the button's raw text and is stripped here —
 * the one place titles are parsed, so every later comparison sees the same
 * plain string.
 */
async function readSectionHeaders(
  scope: Page | Locator,
  selector: string,
): Promise<{ header: Locator; title: string }[]> {
  const headers = await scope.locator(selector).all();
  return Promise.all(
    headers.map(async (header) => ({
      header,
      title: ((await header.textContent()) ?? '').replace(/[▾▸]/g, '').replace(/\s+/g, ' ').trim(),
    })),
  );
}

/**
 * Keep only the entries NOT contained inside another entry's own section —
 * i.e. one level, batch-relative. A grandchild present in the same batch
 * (an already-open nested section under an already-open group member, e.g.
 * FLUID under ISM under ANALYTIC MODEL) waits for its OWN parent's turn
 * instead: `exerciseSection` re-discovers it there once that parent has
 * expanded, which is also where its slider-nudge belongs.
 */
async function filterDirectHeaders(
  entries: readonly { header: Locator; title: string }[],
): Promise<{ header: Locator; title: string }[]> {
  const roots = await Promise.all(
    entries.map((entry) => entry.header.locator('xpath=../..').elementHandle()),
  );
  const headers = await Promise.all(entries.map((entry) => entry.header.elementHandle()));
  const isDirect = await Promise.all(
    entries.map(async (_, i) => {
      const header = headers[i];
      if (!header) return false;
      for (let j = 0; j < entries.length; j++) {
        const root = roots[j];
        if (j === i || !root) continue;
        if (await root.evaluate((r, h) => r.contains(h), header)) return false;
      }
      return true;
    }),
  );
  return entries.filter((_, i) => isDirect[i]);
}

/**
 * One step up and back down, so the sweep leaves the parameters where it found
 * them (to within the step grid). The direction flips at the maximum, where an
 * ArrowRight is a no-op and the pair would not cancel.
 */
async function nudgeSlider(page: Page, slider: Locator): Promise<void> {
  const value = Number(await slider.getAttribute('aria-valuenow'));
  const max = Number(await slider.getAttribute('aria-valuemax'));
  const up = !(value >= max);
  await slider.press(up ? 'ArrowRight' : 'ArrowLeft');
  await settleFrames(page, NUDGE_FRAMES);
  await slider.press(up ? 'ArrowLeft' : 'ArrowRight');
}

/**
 * Exercise one section: expand it, nudge its own sliders, then hand back a
 * step per DIRECT child section found inside — `main`'s queue runs those
 * right after this one (`queue.unshift`), so a section is fully expanded and
 * driven before the sweep moves on to its next sibling. The same recursion
 * now covers every depth the panel has (ANALYTIC MODEL → ISM → DIG is
 * three), because the header is re-resolved by TITLE below rather than a
 * position captured up front — a `.nth(index)` locator re-queries the DOM
 * by ordinal at click time, and an earlier sibling's expansion inserting new
 * matching headers ahead of a later one's captured index is exactly the
 * "section header now reads X, not Y" failure a `group` section made common
 * (two levels of siblings can now shift each other instead of one).
 *
 * `rows` is filled as the sweep goes and is what the coverage report at the
 * end is printed from.
 */
function exerciseSection(title: string, rows: SectionRow[]): ExerciseStep {
  return {
    name: `section:${title}`,
    run: async (page) => {
      const row: SectionRow = { title, sliders: null };
      rows.push(row);

      // Accessible name, not a captured locator: the chevron is aria-hidden,
      // so `title` (already stripped of it) is the whole name, and section
      // titles are unique panel-wide (grepped at the time this was written).
      // Zero matches is the one shape-change still worth failing loudly on —
      // a section that existed at discovery time and is truly gone now, not
      // one that merely moved.
      const header = page.getByRole('button', { name: title, exact: true });
      const matches = await header.count();
      if (matches === 0) {
        throw new Error(`section '${title}' vanished mid-sweep — the panel changed shape`);
      }
      if (matches > 1) {
        throw new Error(`section '${title}' is ambiguous — ${matches} headers share this title`);
      }

      if ((await header.getAttribute('aria-expanded')) !== 'true') {
        await header.click();
        await settleFrames(page, SETTLE_FRAMES);
      }

      // `.header`'s next sibling is `.body` (see CollapsibleSection.tsx) —
      // walked structurally rather than through a hashed CSS-module class
      // name, and only present once the click above has mounted it. (The
      // previous `header.locator('xpath=..')` stopped ONE level short, at
      // `.header` itself, which holds no sliders at all — this section's
      // own slider count was silently zero on every run.)
      const body = header.locator('xpath=../following-sibling::*[1]');

      const sliders = body.getByRole('slider');
      const count = await sliders.count();
      row.sliders = count;
      for (let i = 0; i < count; i++) await nudgeSlider(page, sliders.nth(i));

      // Only THIS section's own direct children (see filterDirectHeaders) —
      // a grandchild already visible here (an already-open nested section
      // under this already-open one) is filtered back out and picked up by
      // its OWN parent's step instead, one level at a time.
      const nested = await filterDirectHeaders(await readSectionHeaders(body, SECTION_HEADER));
      return nested.map((section) => exerciseSection(section.title, rows));
    },
  };
}

/**
 * Expand every collapsible section — and everything nested inside it — and
 * drive whatever sliders appear. Seeded from a page-wide, TOP-LEVEL-only
 * scan (`TOP_LEVEL_SECTION_HEADER`): a nested section is never discovered
 * from here, only from its own parent's body once that parent is open. A
 * `group` member (ANALYTIC MODEL's FIELD, HII REGIONS, …) also matches this
 * selector — `group` deliberately leaves it un-`data-nested` — so
 * `filterDirectHeaders` is what actually keeps this list top-level: it
 * excludes anything contained in another match's own section root.
 */
function sweepSections(rows: SectionRow[]): ExerciseStep {
  return {
    name: 'sections:discover',
    run: async (page) => {
      const found = await filterDirectHeaders(
        await readSectionHeaders(page, TOP_LEVEL_SECTION_HEADER),
      );
      return found.map((section) => exerciseSection(section.title, rows));
    },
  };
}

/**
 * The exact fixture armRidgeDebugSample.wesl's `fixtureGeom`/`fixtureArmA`/
 * `fixtureArmB`/`LOG_R` hard-code — hand-mirrored, not read back from the
 * shader (a WGSL const has no run-time path to this file). Every field the
 * probed functions read is real, INCLUDING the four warp fields and
 * `armFullRadius` (fix round 1 — needed once `armRidgeFrameAt`'s
 * `warpHeight`/`warpSurfaceFrame` calls and `armExcessSurfaceShape` joined
 * the probe); the rest of `GalaxyDescription`/`GalaxyFieldTuning` is dead
 * weight this exercise never reaches, hence the cast rather than a full
 * literal.
 */
const ARM_RIDGE_FIXTURE_GEOMETRY = {
  waveAmount: 0.3,
  armStartRadius: 2.0,
  armInnerRampW: 1.5,
  armFullRadius: 6.0,
  diskScaleLen: 3.0,
  warpStrength: 0.4,
  warpTwist: 1.2,
  warpStartRadius: 8.0,
  outerRadius: 15.0,
} as unknown as GalaxyDescription;

const ARM_RIDGE_FIXTURE_TUNING = { arms: { widthScale: 1.2 } } as unknown as GalaxyFieldTuning;

const ARM_RIDGE_FIXTURE_ARM_A: GalaxyFieldArmRecord = {
  phase: 0.5,
  pitch: 0.3,
  weight: 0,
  fadeRadius: 9.0,
  spanStartLogR: 0,
  meanderAmp: 0.12,
  meanderFreq: 1.4,
  meanderPhase: 0.7,
  age: 0,
  clumpF1: 0,
  clumpP1: 0,
  clumpF2: 0,
  clumpP2: 0,
  waveF1: 2.1,
  waveP1: 0.4,
  waveF2: 3.7,
  waveP2: 1.1,
};

const ARM_RIDGE_FIXTURE_ARM_B: GalaxyFieldArmRecord = {
  ...ARM_RIDGE_FIXTURE_ARM_A,
  phase: -1.2,
  pitch: 0.42,
  fadeRadius: 11.5,
  meanderAmp: 0.2,
  meanderFreq: 0.9,
  meanderPhase: -0.3,
  waveF1: 1.6,
  waveP1: -0.5,
  waveF2: 4.2,
  waveP2: 2.0,
};

const ARM_RIDGE_FIXTURE_LOG_R = [-0.5, 0.4, 0.9, 1.6];
// Fix round 1: armExcessSurfaceShape's own two args (not geometry fields —
// see armRidgeGeometry.ts's own signature) and armColor's per-sample inputs,
// mirroring armRidgeDebugSample.wesl's H_LIGHT/EXCESS_SCALE_RATIO/
// YOUNG_FRACTION/RADIAL_T.
const ARM_RIDGE_FIXTURE_H_LIGHT = 2.5;
const ARM_RIDGE_FIXTURE_EXCESS_SCALE_RATIO = 1.4;
const ARM_RIDGE_FIXTURE_YOUNG_FRACTION = [0.2, 0.4, 0.6, 0.8];
const ARM_RIDGE_FIXTURE_RADIAL_T = [0.8, 0.6, 0.4, 0.2];

/**
 * armRidgeDebugSample.wesl's own per-sample lane order, computed the CPU
 * way: angle, fadeEnvelope, crossSigma, then `armRidgeFrameAt`'s
 * point/along/across/pole (the fix-round-1 addition — the only probed path
 * that reaches `armRidgeCurvePoint`/`warpHeight`/`warpSurfaceFrame`, so a
 * mismatch here is the derivative/Gram-Schmidt/cross-product canary the
 * original trio couldn't be), then excessSurfaceShape, then color.
 */
function armRidgeSampleCpuReference(): number[] {
  const out: number[] = [];
  for (let i = 0; i < ARM_RIDGE_FIXTURE_LOG_R.length; i++) {
    const arm = i % 2 === 0 ? ARM_RIDGE_FIXTURE_ARM_A : ARM_RIDGE_FIXTURE_ARM_B;
    const logR = ARM_RIDGE_FIXTURE_LOG_R[i]!;
    const radius = ARM_RIDGE_FIXTURE_GEOMETRY.armStartRadius * Math.exp(logR);
    const frame = armRidgeFrameAt(logR, ARM_RIDGE_FIXTURE_GEOMETRY, arm);
    const excess = armExcessSurfaceShape(
      radius,
      ARM_RIDGE_FIXTURE_GEOMETRY,
      ARM_RIDGE_FIXTURE_H_LIGHT,
      ARM_RIDGE_FIXTURE_EXCESS_SCALE_RATIO,
    );
    const color = armColor(ARM_RIDGE_FIXTURE_YOUNG_FRACTION[i]!, ARM_RIDGE_FIXTURE_RADIAL_T[i]!);
    out.push(
      armRidgeAngle(logR, ARM_RIDGE_FIXTURE_GEOMETRY, arm),
      armFadeEnvelope(radius, ARM_RIDGE_FIXTURE_GEOMETRY, arm),
      armCrossSigma(radius, ARM_RIDGE_FIXTURE_GEOMETRY, ARM_RIDGE_FIXTURE_TUNING),
      ...frame.point,
      ...frame.along,
      ...frame.across,
      ...frame.pole,
      excess,
      ...color,
    );
  }
  return out;
}

/**
 * The exercise. Booting alone would have missed most of what the field
 * refactor touches: the debug views, the reduced-resolution targets and the
 * extras path only encode passes (and only rebuild bind groups) once switched
 * on, so each is switched on AND back off here.
 */
function buildSteps(url: string, sections: SectionRow[]): readonly ExerciseStep[] {
  const debugViews = ['Dust view', 'ISM map view', 'Orientation view', 'Bubble view'];
  const steps: ExerciseStep[] = [
    {
      name: 'boot',
      run: async (page) => {
        // `?probeReadback` is what makes Viewport.tsx put the engine handle
        // on `window` for the step below — see its own doc.
        await page.goto(`${url}/?probeReadback`, { waitUntil: 'load', timeout: BOOT_TIMEOUT_MS });
        const fallback = page.getByText('WebGPU is required');
        const loading = page.getByText('Initializing WebGPU');
        await Promise.race([
          loading.waitFor({ state: 'detached', timeout: BOOT_TIMEOUT_MS }),
          fallback.waitFor({ state: 'visible', timeout: BOOT_TIMEOUT_MS }),
        ]);
        if (await fallback.isVisible()) {
          throw new Error('engine refused to boot — the WebGPU fallback card is showing');
        }
      },
    },
    {
      // The boot preset (defaultGalaxyIsmMapParams.ts) is `generator: 'fluid'`
      // with 144 steps, so `setParams` in Viewport.tsx already dispatched
      // `ringReduce` and scheduled the CPU `ismMapData` readback before this
      // step runs — no preset picking needed, just enough settle for both
      // async landings (see createGalaxyModel.ts's `rebuildIsmMap`).
      name: 'readback:ringMeans',
      run: async (page) => {
        await settleFrames(page, SETTLE_FRAMES);
        const readback = await page.evaluate(async () => {
          const bridge = (globalThis as unknown as { __probeEngine?: GalaxyEngineHandle })
            .__probeEngine;
          if (!bridge) {
            return {
              ok: false as const,
              reason: 'no __probeEngine — the probeReadback gate never installed it',
            };
          }
          const map = bridge.getIsmMapData();
          if (!map) return { ok: false as const, reason: 'getIsmMapData() is still null' };
          // Now rejects on a mapAsync failure or decode throw (createReadbackQueue.ts's
          // `onError`) instead of hanging page.evaluate forever — caught here so a
          // GPU-side failure reports as a normal step FAIL, not a stuck probe run.
          let gpuMeans: Float32Array;
          try {
            gpuMeans = await bridge.requestRingMeansReadback();
          } catch (err) {
            return {
              ok: false as const,
              reason: `requestRingMeansReadback rejected — ${err instanceof Error ? err.message : String(err)}`,
            };
          }
          // Typed arrays don't survive page.evaluate's return serialization
          // as themselves — plain arrays do.
          return {
            ok: true as const,
            az: map.az,
            rings: map.rings,
            rMin: map.rMin,
            rMax: map.rMax,
            data: Array.from(map.data),
            gpuMeans: Array.from(gpuMeans),
          };
        });
        if (!readback.ok) throw new Error(`readback:ringMeans — ${readback.reason}`);

        const cpuMap: GalaxyIsmMap = {
          az: readback.az,
          rings: readback.rings,
          rMin: readback.rMin,
          rMax: readback.rMax,
          data: Float32Array.from(readback.data),
        };
        const cpuMeans = ismMapRingMeans(cpuMap, (texel) => texel.dust);
        if (cpuMeans.length !== readback.gpuMeans.length) {
          throw new Error(
            `readback:ringMeans — length mismatch: CPU ${cpuMeans.length}, GPU ${readback.gpuMeans.length}`,
          );
        }
        let maxDiff = 0;
        let maxRing = -1;
        for (let ring = 0; ring < cpuMeans.length; ring++) {
          const diff = Math.abs(cpuMeans[ring]! - readback.gpuMeans[ring]!);
          if (diff > maxDiff) {
            maxDiff = diff;
            maxRing = ring;
          }
        }
        console.error(
          `  readback:ringMeans max |CPU-GPU| = ${maxDiff.toExponential(3)} at ring ${maxRing} ` +
            `(tolerance ${RING_MEANS_TOLERANCE.toExponential(3)})`,
        );
        if (maxDiff > RING_MEANS_TOLERANCE) {
          throw new Error(
            `readback:ringMeans — ring ${maxRing}: CPU ${cpuMeans[maxRing]} vs GPU ` +
              `${readback.gpuMeans[maxRing]}, diff ${maxDiff} exceeds tolerance ${RING_MEANS_TOLERANCE}`,
          );
        }
      },
    },
    {
      // Task 12's own numeric-validation exception (armRidge.wesl has no
      // non-GPU path to check its output against) — same shape as
      // `readback:ringMeans` above, minus the ismMap generator dependency:
      // `requestArmRidgeSampleReadback` dispatches its own fixed compute
      // kernel and maps its output straight back.
      name: 'readback:armRidgeSample',
      run: async (page) => {
        const gpuSamples = await page.evaluate(async () => {
          const bridge = (globalThis as unknown as { __probeEngine?: GalaxyEngineHandle })
            .__probeEngine;
          if (!bridge) {
            throw new Error(
              'readback:armRidgeSample — no __probeEngine — the probeReadback gate never installed it',
            );
          }
          const data = await bridge.requestArmRidgeSampleReadback();
          return Array.from(data);
        });

        const cpuSamples = armRidgeSampleCpuReference();
        if (cpuSamples.length !== gpuSamples.length) {
          throw new Error(
            `readback:armRidgeSample — length mismatch: CPU ${cpuSamples.length}, GPU ${gpuSamples.length}`,
          );
        }
        let maxDiff = 0;
        let maxIndex = -1;
        for (let i = 0; i < cpuSamples.length; i++) {
          const diff = Math.abs(cpuSamples[i]! - gpuSamples[i]!);
          if (diff > maxDiff) {
            maxDiff = diff;
            maxIndex = i;
          }
        }
        console.error(
          `  readback:armRidgeSample max |CPU-GPU| = ${maxDiff.toExponential(3)} at lane ${maxIndex} ` +
            `(tolerance ${ARM_RIDGE_SAMPLE_TOLERANCE.toExponential(3)})`,
        );
        if (maxDiff > ARM_RIDGE_SAMPLE_TOLERANCE) {
          throw new Error(
            `readback:armRidgeSample — lane ${maxIndex}: CPU ${cpuSamples[maxIndex]} vs GPU ` +
              `${gpuSamples[maxIndex]}, diff ${maxDiff} exceeds tolerance ${ARM_RIDGE_SAMPLE_TOLERANCE}`,
          );
        }
      },
    },
    {
      // Task 6's own numeric-validation exception (ismMapDustCdfScan.wesl
      // has no production caller yet — Tasks 7/8 wire the real ISM-map
      // texture through it). `requestIsmMapDustCdfScanReadback` dispatches
      // its own small fixture and hands the fixture's raw texel data BACK
      // alongside the GPU prefix — the CPU reference below runs the real
      // `buildIsmMapDustCdf` over that same data, no hand-duplicated
      // fixture literal to drift out of sync with the shader's own.
      //
      // Task 7's fix round: the density callback below is no longer a bare
      // channel read — it mirrors dustParticleCloud.ts's density() closure
      // (:208-218) exactly (ring-mean-normalised, capped by the SAME
      // `ringCap` the GPU fixture dispatched with), so this comparison
      // proves `dustPlacementCap` is live on the GPU path, not just that a
      // bare-channel scan still agrees with itself.
      name: 'readback:ismMapDustCdfScan',
      run: async (page) => {
        const readback = await page.evaluate(async () => {
          const bridge = (globalThis as unknown as { __probeEngine?: GalaxyEngineHandle })
            .__probeEngine;
          if (!bridge) {
            throw new Error(
              'readback:ismMapDustCdfScan — no __probeEngine — the probeReadback gate never installed it',
            );
          }
          return bridge.requestIsmMapDustCdfScanReadback();
        });

        const cpuMap: GalaxyIsmMap = {
          az: readback.grid.az,
          rings: readback.grid.rings,
          rMin: readback.grid.rMin,
          rMax: readback.grid.rMax,
          data: Float32Array.from(readback.data),
        };
        const ringMeans = ismMapRingMeans(cpuMap, (texel) => texel.dust);
        const globalMean = arrayMean(ringMeans);
        const cap = readback.ringCap;
        const cpuCdf = buildIsmMapDustCdf(cpuMap, (texel, radius) => {
          const ring = ismMapRingIndexForRadius(radius, cpuMap.rings, cpuMap.rMin, cpuMap.rMax);
          const ringMean = ringMeans[ring]!;
          if (texel.dust <= 0 || ringMean <= 0 || globalMean <= 0) return 0;
          const local = texel.dust / ringMean;
          const capped = cap > 0 ? Math.min(local, cap) : local;
          return (ringMean / globalMean) * capped;
        });
        if (cpuCdf.prefix.length !== readback.prefix.length) {
          throw new Error(
            `readback:ismMapDustCdfScan — length mismatch: CPU ${cpuCdf.prefix.length}, GPU ${readback.prefix.length}`,
          );
        }
        let maxDiff = 0;
        let maxIndex = -1;
        for (let i = 0; i < cpuCdf.prefix.length; i++) {
          const diff = Math.abs(cpuCdf.prefix[i]! - readback.prefix[i]!);
          if (diff > maxDiff) {
            maxDiff = diff;
            maxIndex = i;
          }
        }
        console.error(
          `  readback:ismMapDustCdfScan max |CPU-GPU| = ${maxDiff.toExponential(3)} at texel ${maxIndex} ` +
            `(tolerance ${ISM_MAP_DUST_CDF_SCAN_TOLERANCE.toExponential(3)})`,
        );
        if (maxDiff > ISM_MAP_DUST_CDF_SCAN_TOLERANCE) {
          throw new Error(
            `readback:ismMapDustCdfScan — texel ${maxIndex}: CPU ${cpuCdf.prefix[maxIndex]} vs GPU ` +
              `${readback.prefix[maxIndex]}, diff ${maxDiff} exceeds tolerance ${ISM_MAP_DUST_CDF_SCAN_TOLERANCE}`,
          );
        }

        // Tasks 7/8's binary search assumes a non-decreasing prefix buffer —
        // the review flagged this as ASSERTED, not proven (float
        // non-associativity across the tree-scan/fold boundary could in
        // principle produce a tiny local decrease). Check it on the real
        // GPU output rather than argue it analytically.
        let decreaseIndex = -1;
        for (let i = 1; i < readback.prefix.length; i++) {
          if (readback.prefix[i]! < readback.prefix[i - 1]!) {
            decreaseIndex = i;
            break;
          }
        }
        if (decreaseIndex >= 0) {
          throw new Error(
            `readback:ismMapDustCdfScan — prefix buffer decreases at texel ${decreaseIndex}: ` +
              `${readback.prefix[decreaseIndex - 1]} -> ${readback.prefix[decreaseIndex]} ` +
              `(Tasks 7/8's binary search needs a non-decreasing prefix)`,
          );
        }
        console.error(
          '  readback:ismMapDustCdfScan prefix buffer is non-decreasing across all texels',
        );
      },
    },
    {
      // Task 7's own numeric-validation exception — placeDust.wesl has no
      // CPU reference to diff against (unlike ringMeans/ismMapDustCdfScan
      // above, it's a fresh algorithm, not a port of a still-live CPU
      // twin): what's checked instead is the plan's own three DoD
      // properties — (1) determinism: two independent dispatches at the
      // same (seed, grid) must be bit-identical, no epsilon slack;
      // (2) count matches `computePlaceDustBudget`'s own CPU budget math
      // for the boot preset; (3) the survival floor is OBSERVABLE — at
      // least one record's amplitude reads exactly 0, not merely absent.
      name: 'readback:placeDust',
      run: async (page) => {
        await settleFrames(page, SETTLE_FRAMES);
        const first = await page.evaluate(async () => {
          const bridge = (globalThis as unknown as { __probeEngine?: GalaxyEngineHandle })
            .__probeEngine;
          if (!bridge) {
            throw new Error(
              'readback:placeDust — no __probeEngine — the probeReadback gate never installed it',
            );
          }
          const landed = await bridge.requestDustPlacementReadback();
          if (!landed) return null;
          return { count: landed.count, records: Array.from(landed.records) };
        });
        if (!first) {
          throw new Error(
            'readback:placeDust — requestDustPlacementReadback() returned null at boot (no dust reserved)',
          );
        }

        const second = await page.evaluate(async () => {
          const bridge = (globalThis as unknown as { __probeEngine?: GalaxyEngineHandle })
            .__probeEngine;
          const landed = await bridge!.requestDustPlacementReadback();
          return landed ? Array.from(landed.records) : null;
        });
        if (!second) {
          throw new Error(
            'readback:placeDust — second requestDustPlacementReadback() returned null',
          );
        }

        // (1) Determinism — bit-identical, no tolerance: two dispatches at
        // the same (seed, grid) are the SAME pure function of a stateless
        // hash, not two independent random draws.
        if (first.records.length !== second.length) {
          throw new Error(
            `readback:placeDust — length mismatch across two dispatches: ${first.records.length} vs ${second.length}`,
          );
        }
        let mismatchIndex = -1;
        for (let i = 0; i < first.records.length; i++) {
          if (first.records[i] !== second[i]) {
            mismatchIndex = i;
            break;
          }
        }
        if (mismatchIndex >= 0) {
          throw new Error(
            `readback:placeDust — non-deterministic at float ${mismatchIndex}: ` +
              `${first.records[mismatchIndex]} vs ${second[mismatchIndex]} (expected bit-identical)`,
          );
        }
        console.error(`  readback:placeDust two dispatches bit-identical (${first.count} records)`);

        // (2) Count matches computePlaceDustBudget's own CPU budget math for
        // the boot preset (defaultGalaxyGenerationParams.ts's MILKY_WAY_GALAXY_PARAMS
        // + DEFAULT_GALAXY_DUST_PARAMS — the same params/tuning the tool boots with).
        const geometry = describeGalaxy(MILKY_WAY_GALAXY_PARAMS);
        const expectedBudget = computePlaceDustBudget(geometry, DEFAULT_GALAXY_DUST_PARAMS);
        if (!expectedBudget) {
          throw new Error(
            'readback:placeDust — CPU computePlaceDustBudget returned null for the boot preset',
          );
        }
        if (first.count !== expectedBudget.count) {
          throw new Error(
            `readback:placeDust — count ${first.count} does not match computePlaceDustBudget's own budget math (${expectedBudget.count})`,
          );
        }
        console.error(`  readback:placeDust count matches budget math (${first.count})`);

        // (3) Survival-floor zeroing is OBSERVABLE — amplitude sits at lane 3
        // of every FIELD_COMPONENT_FLOATS-wide record (records.wesl's own
        // layout: invCovDiagonal.xyz then amplitude).
        let zeroAmplitudeCount = 0;
        for (let i = 0; i < first.count; i++) {
          if (first.records[i * FIELD_COMPONENT_FLOATS + 3] === 0) zeroAmplitudeCount++;
        }
        if (zeroAmplitudeCount === 0) {
          throw new Error(
            'readback:placeDust — no record has amplitude exactly 0; the survival floor never fired for the boot preset (expected at least one cavity-dropped particle at DUST_SURVIVAL_FLOOR_FRAC)',
          );
        }
        console.error(
          `  readback:placeDust survival floor zeroed ${zeroAmplitudeCount}/${first.count} records`,
        );

        // Mode 1 (smoothDisc, the no-map fallback) — placeDust.wesl's OWN
        // in-shader gate forces this mode whenever generatorIsFluid is
        // false, so requesting the readback with `forceGeneratorIsFluid:
        // false` exercises the branch buildClusteredDiscPlacementChild's
        // mode 1 owns, pinning it before Task 13 adds mode 2 to the same
        // function. Deliberately NOT `setFieldTuning({ ismMap: { generator:
        // 'none' } })` — that DOES flip the tuning for real and hits an
        // unrelated, pre-existing bug in `ismMapGenerator.rebuild`'s own
        // disabled-generator clear path (its `writeTexture` calls target
        // `ismMapTex`/`ismMapDustBlurTex`/`ismMapCartesianTex`, none of
        // which carry `COPY_DST` — out of this task's scope to fix, flagged
        // in the report instead). `forceGeneratorIsFluid` overrides only
        // placeDust.wesl's OWN uniform for this one dispatch, leaving the
        // live tuning (and every other texture) untouched.
        const smoothFirst = await page.evaluate(async () => {
          const bridge = (globalThis as unknown as { __probeEngine?: GalaxyEngineHandle })
            .__probeEngine;
          const landed = await bridge!.requestDustPlacementReadback({
            forceGeneratorIsFluid: false,
          });
          if (!landed) return null;
          return { count: landed.count, records: Array.from(landed.records) };
        });
        if (!smoothFirst) {
          throw new Error(
            'readback:placeDust (smoothDisc) — requestDustPlacementReadback() returned null',
          );
        }
        const smoothSecond = await page.evaluate(async () => {
          const bridge = (globalThis as unknown as { __probeEngine?: GalaxyEngineHandle })
            .__probeEngine;
          const landed = await bridge!.requestDustPlacementReadback({
            forceGeneratorIsFluid: false,
          });
          return landed ? Array.from(landed.records) : null;
        });
        if (!smoothSecond) {
          throw new Error(
            'readback:placeDust (smoothDisc) — second requestDustPlacementReadback() returned null',
          );
        }

        if (smoothFirst.records.length !== smoothSecond.length) {
          throw new Error(
            `readback:placeDust (smoothDisc) — length mismatch across two dispatches: ${smoothFirst.records.length} vs ${smoothSecond.length}`,
          );
        }
        let smoothMismatchIndex = -1;
        for (let i = 0; i < smoothFirst.records.length; i++) {
          if (smoothFirst.records[i] !== smoothSecond[i]) {
            smoothMismatchIndex = i;
            break;
          }
        }
        if (smoothMismatchIndex >= 0) {
          throw new Error(
            `readback:placeDust (smoothDisc) — non-deterministic at float ${smoothMismatchIndex}: ` +
              `${smoothFirst.records[smoothMismatchIndex]} vs ${smoothSecond[smoothMismatchIndex]} (expected bit-identical)`,
          );
        }
        console.error(
          `  readback:placeDust (smoothDisc) two dispatches bit-identical (${smoothFirst.count} records)`,
        );

        // computePlaceDustBudget never reads tuning.ismMap.generator — the
        // reservation count must be UNCHANGED from the mapDensity check above.
        if (smoothFirst.count !== expectedBudget.count) {
          throw new Error(
            `readback:placeDust (smoothDisc) — count ${smoothFirst.count} does not match computePlaceDustBudget's own budget math (${expectedBudget.count})`,
          );
        }
        console.error(
          `  readback:placeDust (smoothDisc) count matches budget math (${smoothFirst.count})`,
        );

        // dustParticleCloud.ts's smoothDisc path never runs S3's survival
        // filter (alive is always true off the map path, dustParticleCloud.ts:264)
        // — matching the CPU exactly means EVERY record's amplitude is
        // nonzero here, the mirror image of the mapDensity assertion above.
        let smoothZeroAmplitudeCount = 0;
        for (let i = 0; i < smoothFirst.count; i++) {
          if (smoothFirst.records[i * FIELD_COMPONENT_FLOATS + 3] === 0) smoothZeroAmplitudeCount++;
        }
        if (smoothZeroAmplitudeCount > 0) {
          throw new Error(
            `readback:placeDust (smoothDisc) — ${smoothZeroAmplitudeCount}/${smoothFirst.count} records have amplitude exactly 0; the CPU smoothDisc path never zeroes (no survival filter off the map path)`,
          );
        }
        console.error(
          `  readback:placeDust (smoothDisc) no records zeroed, matching the CPU's own no-survival-filter behaviour`,
        );
      },
    },
    {
      // Task 14's own numeric-validation exception — placeArmSpurCloud.wesl
      // has no CPU reference to diff against either (a fresh shader, not a
      // port of a still-live CPU twin's exact bytes). Checked instead: (1)
      // determinism, same bit-identical bar placeDust's own check sets; (2)
      // count matches deriveArmSpurCloudCount's own CPU budget math for the
      // boot preset; (3) liveness — every record's amplitude is finite and
      // positive, the mirror image of placeDust's survival-floor check: the
      // CPU original (buildArmSpurParticleCloud) never zeroes an individual
      // placed sprite, so NONE zeroed here is the matching behaviour, not a
      // gap.
      name: 'readback:placeArmSpurCloud',
      run: async (page) => {
        await settleFrames(page, SETTLE_FRAMES);
        const first = await page.evaluate(async () => {
          const bridge = (globalThis as unknown as { __probeEngine?: GalaxyEngineHandle })
            .__probeEngine;
          if (!bridge) {
            throw new Error(
              'readback:placeArmSpurCloud — no __probeEngine — the probeReadback gate never installed it',
            );
          }
          const landed = await bridge.requestArmSpurCloudPlacementReadback();
          if (!landed) return null;
          return { count: landed.count, offset: landed.offset, records: Array.from(landed.records) };
        });
        if (!first) {
          throw new Error(
            'readback:placeArmSpurCloud — requestArmSpurCloudPlacementReadback() returned null at boot (no spur cloud reserved — expected one under the boot preset\'s default arms.spurs.enabled=true)',
          );
        }

        const second = await page.evaluate(async () => {
          const bridge = (globalThis as unknown as { __probeEngine?: GalaxyEngineHandle })
            .__probeEngine;
          const landed = await bridge!.requestArmSpurCloudPlacementReadback();
          return landed ? Array.from(landed.records) : null;
        });
        if (!second) {
          throw new Error(
            'readback:placeArmSpurCloud — second requestArmSpurCloudPlacementReadback() returned null',
          );
        }

        // (1) Determinism — bit-identical, no tolerance: two dispatches at
        // the same seed are the SAME pure function of a stateless hash.
        if (first.records.length !== second.length) {
          throw new Error(
            `readback:placeArmSpurCloud — length mismatch across two dispatches: ${first.records.length} vs ${second.length}`,
          );
        }
        let mismatchIndex = -1;
        for (let i = 0; i < first.records.length; i++) {
          if (first.records[i] !== second[i]) {
            mismatchIndex = i;
            break;
          }
        }
        if (mismatchIndex >= 0) {
          throw new Error(
            `readback:placeArmSpurCloud — non-deterministic at float ${mismatchIndex}: ` +
              `${first.records[mismatchIndex]} vs ${second[mismatchIndex]} (expected bit-identical)`,
          );
        }
        console.error(
          `  readback:placeArmSpurCloud two dispatches bit-identical (${first.count} records)`,
        );

        // (2) Count matches deriveArmSpurCloudCount's own CPU budget math
        // for the boot preset (MILKY_WAY_GALAXY_PARAMS + the tool's own
        // DEFAULT_GALAXY_FIELD_TUNING — fieldTuningSlice.ts's own initial
        // state, so this is the SAME tuning the boot page actually runs).
        const geometry = describeGalaxy(MILKY_WAY_GALAXY_PARAMS);
        const spurArms = buildArmSpurs(
          geometry,
          DEFAULT_GALAXY_FIELD_TUNING.arms.spurs,
          geometry.seed,
        );
        const expectedCount = deriveArmSpurCloudCount(
          spurArms,
          geometry,
          DEFAULT_GALAXY_FIELD_TUNING,
        );
        if (first.count !== expectedCount) {
          throw new Error(
            `readback:placeArmSpurCloud — count ${first.count} does not match deriveArmSpurCloudCount's own budget math (${expectedCount})`,
          );
        }
        console.error(`  readback:placeArmSpurCloud count matches budget math (${first.count})`);

        // (3) Liveness — every record's amplitude (lane 3 of every
        // FIELD_COMPONENT_FLOATS-wide record) is finite and strictly
        // positive. buildArmSpurParticleCloud never zeroes an individual
        // placed sprite (no survival filter on this tier, unlike dust's
        // map-density path) — a zero or non-finite amplitude here means the
        // weighted pick, the rejection loop, or the flux-weight math is
        // broken, not a legitimate CPU-matching cavity.
        let nonPositiveCount = 0;
        for (let i = 0; i < first.count; i++) {
          const amplitude = first.records[i * FIELD_COMPONENT_FLOATS + 3]!;
          if (!(Number.isFinite(amplitude) && amplitude > 0)) nonPositiveCount++;
        }
        if (nonPositiveCount > 0) {
          throw new Error(
            `readback:placeArmSpurCloud — ${nonPositiveCount}/${first.count} records have a non-finite or non-positive amplitude (expected every reserved slot live, no survival filter on this tier)`,
          );
        }
        console.error(
          `  readback:placeArmSpurCloud all ${first.count} records live (finite, positive amplitude)`,
        );
      },
    },
    {
      name: 'pill:analytic-model',
      run: async (page) => {
        const pill = page.getByRole('checkbox', { name: 'Toggle analytic model' });
        await pill.uncheck();
        await settleFrames(page, SETTLE_FRAMES);
        await pill.check();
      },
    },
    {
      // LEGACY MODEL's own header pill toggles `render.spriteField`, same
      // treatment as `pill:analytic-model` above (its sibling header pill on
      // the other group).
      name: 'pill:legacy-model',
      run: async (page) => {
        const pill = page.getByRole('checkbox', { name: 'Toggle legacy model' });
        await pill.check();
        await settleFrames(page, SETTLE_FRAMES);
        await pill.uncheck();
      },
    },
    {
      name: 'section:debug-views',
      run: async (page) => {
        await page.getByRole('button', { name: 'DEBUG VIEWS' }).click();
        await page.getByRole('slider', { name: 'Dust view', exact: true }).waitFor();
      },
    },
  ];

  for (const label of debugViews) {
    steps.push({
      name: `debug-view:${label}`,
      run: async (page) => {
        await pressSlider(page, label, ['End']);
        await settleFrames(page, SETTLE_FRAMES);
        await pressSlider(page, label, ['Home']);
      },
    });
  }

  steps.push(
    {
      name: 'param-nudge:arm-width',
      // 'Arm width' lives under LEGACY MODEL, which boots FOLDED
      // (defaultUiState.ts) — this step runs ahead of the section sweep, so
      // it opens the group itself rather than assuming boot-open state.
      run: async (page) => {
        const legacy = page.getByRole('button', { name: 'LEGACY MODEL', exact: true });
        if ((await legacy.getAttribute('aria-expanded')) !== 'true') {
          await legacy.click();
        }
        await pressSlider(page, 'Arm width', ['ArrowRight', 'ArrowRight', 'ArrowLeft']);
      },
    },
    // Ahead of `regenerate:randomize` on purpose: the Hubble category decides
    // which sections exist at all (no SPIRAL ARMS on an elliptical), so a
    // randomized type would make the coverage count differ run to run.
    sweepSections(sections),
    {
      // The one surface with no React between the event and the engine —
      // orbit and zoom run through createOrbitCameraInput's own listeners,
      // and the apparent-size LOD gate keys off what they produce.
      name: 'camera:orbit-zoom',
      run: async (page) => {
        const box = await page.locator('canvas').boundingBox();
        if (box === null) throw new Error('canvas has no box — the viewport never laid out');
        const x = box.x + box.width * 0.25;
        const y = box.y + box.height * 0.5;
        await page.mouse.move(x, y);
        await page.mouse.down();
        for (const dx of [40, 80, 120]) {
          await page.mouse.move(x + dx, y + dx * 0.5);
          await settleFrames(page, NUDGE_FRAMES);
        }
        await page.mouse.up();
        await page.mouse.wheel(0, -240);
        await settleFrames(page, SETTLE_FRAMES);
        await page.mouse.wheel(0, 240);
      },
    },
    {
      // Every divisor drag reallocates its target and orphans the bind groups
      // built against the old texture — the exact damage class this exists for.
      name: 'target-divisors',
      run: async (page) => {
        for (const label of ['Field target divisor', 'Dust divisor', 'Extras divisor']) {
          await pressSlider(page, label, ['ArrowRight']);
          await settleFrames(page, SETTLE_FRAMES);
          await pressSlider(page, label, ['ArrowLeft']);
          await settleFrames(page, SETTLE_FRAMES);
        }
      },
    },
    {
      name: 'regenerate:randomize',
      run: (page) => page.getByRole('button', { name: 'Randomize', exact: true }).click(),
    },
    {
      name: 'extras:enable-regenerate-disable',
      run: async (page) => {
        const toggle = page.getByRole('checkbox', { name: /Background galaxies/ });
        await toggle.check();
        await settleFrames(page, SETTLE_FRAMES);
        await page.getByRole('button', { name: /Regenerate distant galaxies/ }).click();
        await settleFrames(page, SETTLE_FRAMES);
        await toggle.uncheck();
      },
    },
    {
      // The panel's only other mount/unmount boundary. Auto-fit is left
      // alone deliberately: it is a multi-second hill-climb, and a probe step
      // that can time out on a slow machine teaches everyone to ignore it.
      name: 'compare:panel',
      run: async (page) => {
        await page.getByRole('button', { name: /Compare vs\. real/ }).click();
        await settleFrames(page, SETTLE_FRAMES);
        await page.getByRole('button', { name: /Load preset/ }).click();
        await settleFrames(page, SETTLE_FRAMES);
        await page.getByRole('button', { name: 'Match view' }).click();
        await settleFrames(page, SETTLE_FRAMES);
        await page.getByRole('button', { name: /Hide reference/ }).click();
      },
    },
    {
      // Canvas resize rebuilds every size-following target at once.
      name: 'resize',
      run: async (page) => {
        await page.setViewportSize({ width: 900, height: 620 });
        await settleFrames(page, SETTLE_FRAMES);
        await page.setViewportSize(VIEWPORT);
      },
    },
  );
  return steps;
}

/** The location matters: a bare "Failed to load resource" names nothing on its own. */
function formatConsole(message: ConsoleMessage): string {
  const { url } = message.location();
  return `[${message.type()}] ${message.text()}${url ? ` (${url})` : ''}`;
}

/**
 * Collapse repeats and cap the tail. One broken buffer fires the same
 * validation error on every frame that touches it, AND Chrome echoes each to
 * the console — an unfolded report buries the one distinct fact under
 * dozens of copies of itself.
 */
function summarize(entries: readonly string[], cap: number): string[] {
  const counts = new Map<string, number>();
  for (const entry of entries) counts.set(entry, (counts.get(entry) ?? 0) + 1);
  const lines = [...counts].map(([entry, n]) => (n > 1 ? `${entry}\n    (x${n})` : entry));
  return lines.length <= cap ? lines : [...lines.slice(0, cap), `… and ${lines.length - cap} more`];
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  let server: ViteDevServer | null = null;
  let url = options.url;
  if (url === '') {
    const started = await startDevServer();
    server = started.server;
    url = started.url;
  }

  const browser = await launchChromium(options.headed);
  const gpuErrors: GpuErrorEntry[] = [];
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const consoleWarnings: string[] = [];
  const failedSteps: string[] = [];
  const sections: SectionRow[] = [];
  // Fatal, not cosmetic: the adapter record and the error record come from the
  // SAME init script, so a missing adapter line is how a silently uninstalled
  // hook announces itself instead of reporting a serene zero errors.
  let noAdapter = true;
  let adapterLine = 'NONE RECORDED — the probe hook never saw requestAdapter resolve';

  try {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    await installGpuProbe(page);
    // The tool's index.html declares no favicon, so Chromium asks for one and
    // logs a 404. Answered here rather than filtered out of the report: an
    // allowlist of "errors that don't count" is how a probe learns to lie.
    await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204, body: '' }));

    // Shader compile failures reach the console, not uncapturederror — the
    // repo routes every module through createShaderModuleWithDevLog, which
    // logs them in dev. Console capture is what catches a broken shader link.
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(formatConsole(message));
      else if (message.type() === 'warning') consoleWarnings.push(formatConsole(message));
    });

    const queue = [...buildSteps(url, sections)];
    while (queue.length > 0) {
      const step = queue.shift();
      if (step === undefined) break;
      let ran = true;
      try {
        const discovered = await step.run(page);
        if (discovered) queue.unshift(...discovered);
        await settleFrames(page, SETTLE_FRAMES);
      } catch (err) {
        // A step that can no longer find its control is itself a finding: the
        // probe would otherwise keep passing while exercising less and less.
        ran = false;
        failedSteps.push(`${step.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
      gpuErrors.push(...(await drainGpuErrors(page, step.name)));
      // Progress → stderr, so `> report.txt` keeps the verdict on its own.
      console.error(`  ${ran ? '✓' : '✗'} ${step.name}`);
    }

    const adapters = await page.evaluate(
      () => (globalThis as unknown as { __gpuProbe?: PageProbe }).__gpuProbe?.adapters ?? [],
    );
    const adapter = adapters[0];
    if (adapter) {
      noAdapter = false;
      adapterLine =
        `vendor=${adapter.vendor || '?'} architecture=${adapter.architecture || '?'} ` +
        `device=${adapter.device || '-'} description=${adapter.description || '-'} ` +
        `fallback=${adapter.isFallbackAdapter}`;
    }
    await context.close();
  } finally {
    await browser.close();
    await server?.close();
  }

  console.log('\ngalaxy-renderer GPU error probe');
  console.log(`  url:     ${url}`);
  console.log(`  adapter: ${adapterLine}`);

  // Coverage, spelled out: a probe that quietly exercises less than the reader
  // assumes is the defect this sweep exists to fix, so the count and the
  // sections it could do nothing with are part of the verdict, not a footnote.
  const noSlider = sections.filter((section) => section.sliders === 0);
  const unreached = sections.filter((section) => section.sliders === null);
  const nudges = sections.reduce((sum, section) => sum + (section.sliders ?? 0), 0);
  const names = (rows: readonly SectionRow[]): string => rows.map((row) => row.title).join(', ');
  console.log(
    `  sections: ${sections.length} found, ${sections.length - unreached.length} expanded, ` +
      `${nudges} slider(s) nudged`,
  );
  if (noSlider.length > 0) console.log(`  no drivable slider: ${names(noSlider)}`);
  if (unreached.length > 0) console.log(`  never reached: ${names(unreached)}`);

  const fatal =
    noAdapter ||
    sections.length === 0 ||
    gpuErrors.length + pageErrors.length + consoleErrors.length + failedSteps.length > 0;
  for (const [heading, entries] of [
    ['GPU errors', gpuErrors.map((e) => `[${e.kind}] during '${e.step}': ${e.message}`)],
    ['page errors', pageErrors],
    ['console errors', consoleErrors],
    ['unrunnable steps', failedSteps],
    // Warnings are reported but never fail the run: they are the page's own
    // dev noise, and gating on them would make the probe cry wolf.
    ['console warnings (not fatal)', consoleWarnings],
  ] as const) {
    if (entries.length === 0) continue;
    console.log(`\n${heading} (${entries.length}):`);
    for (const line of summarize(entries, 12)) console.log(`  - ${line}`);
  }

  console.log(
    fatal
      ? `\nFAIL — ${gpuErrors.length} GPU, ${pageErrors.length} page, ${consoleErrors.length} console error(s), ` +
          `${failedSteps.length} unrunnable step(s)${noAdapter ? ', NO ADAPTER' : ''}` +
          `${sections.length === 0 ? ', NO SECTIONS FOUND' : ''}`
      : `\nPASS — no GPU, page or console errors (${consoleWarnings.length} warning(s))`,
  );
  if (fatal) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
