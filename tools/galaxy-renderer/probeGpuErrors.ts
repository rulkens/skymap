/**
 * probeGpuErrors — headless WebGPU *error* probe for the galaxy-renderer tool.
 *
 *   npx tsx tools/galaxy-renderer/probeGpuErrors.ts   # or: npm run galaxy-renderer:probe
 * No test in the repo can reach this tool's engine, so nothing but a human
 * eyeballing the canvas catches a bind group built against a destroyed
 * texture, a uniform buffer too small for its struct, or a shader that stops
 * linking. This drives the real UI in real Chromium and reports what the GPU
 * itself complained about. It judges NOTHING about the picture — errors only.
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

const VIEWPORT = { width: 1400, height: 900 };
// A control change reaches the GPU through store → engineBridge → the next rAF,
// so every step lets a few frames encode before its errors are drained.
const SETTLE_FRAMES = 6;
// Between two sliders of the same section, where the step's own settle at the
// end is the backstop — a section holds up to six of them.
const NUDGE_FRAMES = 2;
const BOOT_TIMEOUT_MS = 60_000;

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
        await page.goto(url, { waitUntil: 'load', timeout: BOOT_TIMEOUT_MS });
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
      name: 'pill:analytic-model',
      run: async (page) => {
        const pill = page.getByRole('checkbox', { name: 'Toggle analytic model' });
        await pill.uncheck();
        await settleFrames(page, SETTLE_FRAMES);
        await pill.check();
      },
    },
    {
      // The old standalone "Legacy sprite stars" checkbox was folded into
      // LEGACY MODEL's own header pill by the group restructure — same
      // `render.spriteField` state, same treatment as `pill:analytic-model`
      // above (its sibling header pill on the other group).
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
      run: (page) => pressSlider(page, 'Arm width', ['ArrowRight', 'ArrowRight', 'ArrowLeft']),
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
        for (const label of ['Field target divisor', 'Dust divisor', 'HII target divisor']) {
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
