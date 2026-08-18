/**
 * probeGpuErrors — headless WebGPU *error* probe for the MCPM workbench.
 *
 *   npx tsx tools/mcpm-workbench/probeGpuErrors.ts   # or: npm run mcpm-workbench:probe
 * Structure and infra (own ephemeral-port dev server, chromium-channel launch
 * with a headless-shell fallback, the `requestDevice` monkey-patch, the step
 * queue + settle-frame + drain loop) mirror `tools/galaxy-renderer/probeGpuErrors.ts`
 * — copied for its structure, not its content: this tool has no collapsible
 * sections/sliders to sweep, so that machinery is dropped. It judges nothing
 * about the picture, only what the GPU itself complained about.
 */

import { chromium, type Browser, type Page, type ConsoleMessage } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';

const VIEWPORT = { width: 1280, height: 800 };
// A control change reaches the GPU through store → Viewport's rAF loop, so
// every step lets a few frames encode before its errors are drained.
const SETTLE_FRAMES = 6;
const BOOT_TIMEOUT_MS = 60_000;

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

type ExerciseStep = { name: string; run: (page: Page) => Promise<void> };

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
 * structurally incapable of testing someone else's checkout — and never
 * risks colliding with a dev server already parked on 5500.
 */
async function startDevServer(): Promise<{ server: ViteDevServer; url: string }> {
  const configFile = fileURLToPath(new URL('./vite.config.ts', import.meta.url));
  const server = await createServer({
    configFile,
    logLevel: 'warn',
    // An OS-assigned port, asked for out-of-band: Vite reads `port: 0` as
    // "unset" and silently serves on its configured 5500 default instead —
    // the one port this probe must never end up on (see the tool's own
    // dev server, which may already be running there).
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
 * The load-bearing hook, installed before a single page script runs: the harness
 * creates its device internally (createMcpmHarness's `initGpu`), so patching
 * `GPUAdapter.prototype` is the only way to reach it. `uncapturederror` is WHERE
 * WebGPU validation failures surface — un-listened-to they are a console line
 * nobody reads.
 *
 * A `device.lost` with reason 'destroyed' is Viewport's own `disposeHarness`
 * (every rebuild tears down the old device) and is deliberately dropped; any
 * other reason is a crash.
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
    // Anonymous on purpose: a NAMED function inside browser-bound code compiles
    // (under tsx/esbuild `keepNames`) to a call to a `__name` helper that exists
    // only in the Node bundle, so the page dies with `ReferenceError: __name is
    // not defined`.
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

/**
 * The exercise: boot, drive the run/reset/clear-trace commands that rebuild
 * bind groups or clear buffers outside the steady state, then each rendering
 * path in turn — the raymarch, the agent splat that replaces it, and the
 * galaxy overlay that layers over it. Order matters once: `resize` runs while
 * splat mode is on, so it covers the screen-sized accumulation buffer as well
 * as the graph's own target. Track V's path tracer appends its step here.
 */
function buildSteps(url: string): readonly ExerciseStep[] {
  return [
    {
      name: 'boot',
      run: async (page) => {
        // `?probe` is what makes Viewport.tsx load `syntheticCatalog()` instead
        // of the network catalogs, and defaultAppState.ts seed a 100k-agent,
        // <=128-long-axis grid — see their own docs. `__mcpmProbeReady` is set
        // once the harness + render graph exist and the rAF loop has started.
        await page.goto(`${url}/?probe`, { waitUntil: 'load', timeout: BOOT_TIMEOUT_MS });
        await page.waitForFunction(
          () => (globalThis as unknown as { __mcpmProbeReady?: boolean }).__mcpmProbeReady === true,
          undefined,
          { timeout: BOOT_TIMEOUT_MS },
        );
      },
    },
    {
      // Exercises propagate → decay → raymarch running for real, several
      // steps in a row (sim.running defaults true) — the steady state every
      // later step below returns to.
      name: 'run:raymarch',
      run: async (page) => settleFrames(page, SETTLE_FRAMES),
    },
    {
      // pause stops `harness.step()` but the raymarch keeps drawing every
      // frame regardless (Viewport.tsx's frame() draws unconditionally) —
      // both branches of that guard get exercised here.
      name: 'toggle:pause',
      run: async (page) => {
        await page.getByRole('button', { name: /^pause: on$/ }).click();
        await settleFrames(page, SETTLE_FRAMES);
      },
    },
    {
      name: 'toggle:resume',
      run: async (page) => {
        await page.getByRole('button', { name: /^resume: off$/ }).click();
        await settleFrames(page, SETTLE_FRAMES);
      },
    },
    {
      // Re-seeds agents and clears depositA/depositB/trace — a distinct
      // buffer-clear path `run:raymarch` above never touches.
      name: 'command:reset',
      run: async (page) => {
        await page.getByRole('button', { name: 'reset: off', exact: true }).click();
        await settleFrames(page, SETTLE_FRAMES);
      },
    },
    {
      // Clears ONLY the trace grid — agents and deposit survive, unlike reset.
      name: 'command:clear-trace',
      run: async (page) => {
        await page.getByRole('button', { name: 'clear trace: off', exact: true }).click();
        await settleFrames(page, SETTLE_FRAMES);
      },
    },
    {
      // The agent splat: a compute dispatch into the atomic screen buffer plus its
      // tonemap blit, replacing the raymarch as the frame's base layer. Left in splat
      // mode so `resize` below exercises the accumulation buffer's rebuild too.
      name: 'run:splat',
      run: async (page) => {
        await page.getByRole('button', { name: 'splat: off', exact: true }).click();
        await settleFrames(page, SETTLE_FRAMES);
      },
    },
    {
      // Canvas resize rebuilds the accum target, the blit's `layout:'auto'` bind group
      // and — because the step above left splat mode on — the splat's screen-sized
      // accumulation buffer, which a stale size would index straight past the end of.
      name: 'resize',
      run: async (page) => {
        await page.setViewportSize({ width: 900, height: 620 });
        await settleFrames(page, SETTLE_FRAMES);
        await page.setViewportSize(VIEWPORT);
        await settleFrames(page, SETTLE_FRAMES);
      },
    },
    {
      name: 'run:raymarch-again',
      run: async (page) => {
        await page.getByRole('button', { name: 'raymarch: off', exact: true }).click();
        await settleFrames(page, SETTLE_FRAMES);
      },
    },
    {
      // The raymarch's other composite. It defaults ON, so only turning it off
      // reaches the fork-parity 'over' branch of the march loop at all.
      name: 'toggle:additive',
      run: async (page) => {
        await page.getByRole('button', { name: 'additive: on', exact: true }).click();
        await settleFrames(page, SETTLE_FRAMES);
        await page.getByRole('button', { name: 'additive: off', exact: true }).click();
        await settleFrames(page, SETTLE_FRAMES);
      },
    },
    {
      // The galaxy-point overlay, an additive layer over the raymarch — on, then off,
      // because a pass that only ever runs cannot show what disabling it breaks.
      name: 'toggle:galaxy-overlay',
      run: async (page) => {
        await page.getByRole('button', { name: 'galaxies: off', exact: true }).click();
        await settleFrames(page, SETTLE_FRAMES);
        await page.getByRole('button', { name: 'galaxies: on', exact: true }).click();
        await settleFrames(page, SETTLE_FRAMES);
      },
    },
  ];
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
    // index.html declares no favicon, so Chromium asks for one and logs a
    // 404. Answered here rather than filtered out of the report: an
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

    for (const step of buildSteps(url)) {
      let ran = true;
      try {
        await step.run(page);
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

  console.log('\nmcpm-workbench GPU error probe');
  console.log(`  url:     ${url}/?probe`);
  console.log(`  adapter: ${adapterLine}`);

  const fatal =
    noAdapter ||
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
          `${failedSteps.length} unrunnable step(s)${noAdapter ? ', NO ADAPTER' : ''}`
      : `\nPASS — no GPU, page or console errors (${consoleWarnings.length} warning(s))`,
  );
  if (fatal) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
