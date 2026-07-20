/**
 * measurePerf — the headless GPU-timing harness: drive skymap to a fixed camera
 * pose in real Chromium, sample per-pass GPU timings for both encode
 * strategies, and print a per-scenario table with a per-pass floor estimate.
 *
 *   npm run perf                                  # all scenarios, 30 frames, dpr 2
 *   npm run perf -- --scenario solar-system --frames 10
 *
 * ### Why a harness outside the app
 *
 * Frame cost is what we want to characterise, and it depends on WHERE the
 * camera sits — how much geometry projects, how much fill each pass touches. A
 * benchmark must therefore place the camera at an exact, reproducible vantage
 * and read the GPU's own timestamp queries, neither of which belongs in the
 * shipping app. The app's entire contribution is the `window.__skymapPerf` seam
 * (installed only under `?perf`) that this process drives through
 * `page.evaluate`: `setStrategy` flips the encode path, `setPose` hard-cuts the
 * camera, `collectTimings` resolves with the accumulated `PerfSample[]`, and
 * `slotGroups` snapshots the name→groupKey map (see below).
 *
 * ### Unlike the recorder: real wall-time, no virtual clock
 *
 * `recordTour.ts` pauses page time via CDP virtual time so a slow 4K frame
 * never drops a recorded frame. This harness does the OPPOSITE on purpose: it
 * measures REAL GPU wall-time, so it must let the page run at its natural pace
 * and read the timestamp queries the driver fills. Hence no `Emulation
 * .setVirtualTimePolicy`, no ffmpeg, no screenshot — just launch, pose, sample,
 * aggregate. Run-to-run variance (thermal, contention) is why the report is
 * medians/p90 and carries no thresholds.
 *
 * ### Why the harness can't import the frame program
 *
 * The floor estimate buckets per-layer timings into render-step GROUPS, which
 * needs the layer-name→groupKey map. That map is derived in
 * `frameProgram.ts` — but importing it here would transitively pull the
 * renderer layers' `.wesl?static` shader imports, which only Vite resolves; a
 * `tsx` process throws on them. So the map crosses the seam as data: the hook
 * exposes `slotGroups`, and this harness reads it via `page.evaluate`. That is
 * why `measurePerf` imports ONLY Playwright, the two local `./perf*` modules,
 * the pure `../utils/perf/*` aggregators, and the type-only `PerfSample` — never
 * a renderer, shader, or `frameProgram`.
 *
 * Prerequisites: `npm run dev` serving --url (default http://localhost:5173),
 * and the Playwright 'chromium' channel installed
 * ('npx playwright install chromium').
 */

import { chromium, type Browser } from '@playwright/test';
import { PERF_SCENARIOS, type PerfScenario } from './perfScenarios';
import type { ScenarioReport, LayerStat } from './scenarioReport';
import { groupSamplesBySlot } from '../utils/perf/groupSamplesBySlot';
import { median } from '../utils/perf/median';
import { percentile } from '../utils/perf/percentile';
import { estimateFloor } from '../utils/perf/estimateFloor';
import { formatReport } from '../utils/perf/formatReport';
import type { PerfSample } from '../../src/@types/perf/PerfSample';

// Fixed viewport for every run: pixel area is part of what determines pass cost,
// so it stays constant across scenarios and only --dpr scales the backing store.
const VIEWPORT = { width: 1400, height: 900 };

// The two encode strategies the hook can flip between. `merged` bills one
// timing slot per render-step GROUP (the production shape); `perLayerTimed`
// bills one slot per individual layer (the attribution shape). Running both is
// what makes the floor estimate possible.
const STRATEGIES = ['merged', 'perLayerTimed'] as const;

type PerfOptions = {
  /** Scenario name filter; empty = all of PERF_SCENARIOS. */
  scenarios: string[];
  dpr: number;
  frames: number;
  url: string;
};

/**
 * Bespoke argv loop rather than tools/utils/cli/args.ts: parseFlags is
 * deliberately boolean-only, and string/number/repeatable flags need per-script
 * handling. `--scenario` is repeatable (each occurrence appends a filter).
 */
function parseArgs(argv: readonly string[]): PerfOptions {
  const options: PerfOptions = { scenarios: [], dpr: 2, frames: 30, url: 'http://localhost:5173' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (arg === '--scenario' || arg === '--dpr' || arg === '--frames' || arg === '--url') {
      const value = argv[++i];
      if (value === undefined) throw new Error(`${arg} requires a value`);
      if (arg === '--scenario') options.scenarios.push(value);
      if (arg === '--dpr') {
        options.dpr = Number(value);
        if (!Number.isInteger(options.dpr) || options.dpr < 1) {
          throw new Error(`--dpr must be a positive integer, got '${value}'`);
        }
      }
      if (arg === '--frames') {
        options.frames = Number(value);
        if (!Number.isInteger(options.frames) || options.frames < 1) {
          throw new Error(`--frames must be a positive integer, got '${value}'`);
        }
      }
      if (arg === '--url') options.url = value.replace(/\/$/, '');
    } else {
      throw new Error(
        `unknown flag '${arg}' (known: --scenario, --dpr, --frames, --url)`,
      );
    }
  }
  return options;
}

/**
 * Launch pattern mirrored from recordTour: the 'chromium' channel first (full
 * build, WebGPU with no flags), falling back to the headless shell with the
 * WebGPU flags only if the channel is not installed.
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

/** Roll a flat sample stream up into one median+p90 stat per slot. */
function statsOf(samples: readonly PerfSample[]): LayerStat[] {
  const stats: LayerStat[] = [];
  for (const [slot, msList] of groupSamplesBySlot(samples)) {
    stats.push({ slot, median: median(msList), p90: percentile(msList, 90) });
  }
  return stats;
}

/**
 * Attribute per-layer costs to their render-step groups. For each group the
 * `slotGroups` map buckets the perLayer stats into, and that ALSO appears as a
 * merged group slot (slot === groupKey), estimate the shared per-pass floor
 * from `(Σ Lᵢ − G)/n` and each layer's floor-subtracted real cost. Groups with
 * a single layer are skipped (no merged-vs-split gap to separate) — matching
 * `estimateFloor`'s own n<2 guard, so `floors` only ever carries attributable
 * multi-layer groups.
 */
function floorsOf(
  merged: readonly LayerStat[],
  perLayer: readonly LayerStat[],
  slotGroups: Readonly<Record<string, string>>,
): ScenarioReport['floors'] {
  const mergedMedianByGroup = new Map<string, number>();
  for (const stat of merged) mergedMedianByGroup.set(stat.slot, stat.median);

  const buckets = new Map<string, LayerStat[]>();
  for (const stat of perLayer) {
    const groupKey = slotGroups[stat.slot] ?? stat.slot;
    const bucket = buckets.get(groupKey);
    if (bucket) bucket.push(stat);
    else buckets.set(groupKey, [stat]);
  }

  const floors: ScenarioReport['floors'][number][] = [];
  for (const [groupKey, layerStats] of buckets) {
    const mergedMedian = mergedMedianByGroup.get(groupKey);
    if (mergedMedian === undefined || layerStats.length < 2) continue;
    const floor = estimateFloor(
      layerStats.map((stat) => stat.median),
      mergedMedian,
    );
    floors.push({
      groupKey,
      floor,
      reals: layerStats.map((stat) => ({ slot: stat.slot, real: stat.median - floor })),
    });
  }
  return floors;
}

/**
 * Measure ONE scenario: boot the perf page in a fresh context, wait for the
 * hook + `ready`, read the slotGroups map, then sample both strategies and
 * assemble the report. The context is closed by the caller.
 */
async function measureScenario(
  browser: Browser,
  scenario: PerfScenario,
  options: PerfOptions,
): Promise<ScenarioReport> {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: options.dpr,
  });
  try {
    const page = await context.newPage();
    page.on('pageerror', (err) => console.warn(`[page] error: ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.warn(`[page] console.error: ${msg.text()}`);
    });

    await page.goto(`${options.url}/?perf`, { waitUntil: 'load' });
    await page.waitForFunction(
      () => (window as unknown as { __skymapPerf?: unknown }).__skymapPerf !== undefined,
      undefined,
      { polling: 100 },
    );
    // `ready` already debounces "engine ready + loads settled" over a ~1 s
    // window, so awaiting it (no harness-side timeout) is the whole boot wait.
    await page.evaluate(
      () => (window as unknown as { __skymapPerf: { ready: Promise<void> } }).__skymapPerf.ready,
    );
    const slotGroups = (await page.evaluate(
      () =>
        (window as unknown as { __skymapPerf: { slotGroups: Record<string, string> } }).__skymapPerf
          .slotGroups,
    )) as Record<string, string>;

    const statsByStrategy: Record<string, LayerStat[]> = {};
    for (const strategy of STRATEGIES) {
      // setStrategy (next-frame flip) → setPose (hard-cut + arm auto-rotate,
      // resolves on the next rAF) → collectTimings (subscribe, accumulate
      // `frames` frames, resolve). Auto-rotate keeps the render-on-demand loop
      // awake for the whole sampling window with no manual pump.
      const samples = (await page.evaluate(
        async (args) => {
          const hook = (
            window as unknown as {
              __skymapPerf: {
                setStrategy: (s: string) => void;
                setPose: (p: typeof args.pose) => Promise<void>;
                collectTimings: (n: number) => Promise<{ slot: string; ms: number }[]>;
              };
            }
          ).__skymapPerf;
          hook.setStrategy(args.strategy);
          await hook.setPose(args.pose);
          return hook.collectTimings(args.frames);
        },
        { strategy, pose: scenario.pose, frames: options.frames },
      )) as PerfSample[];
      statsByStrategy[strategy] = statsOf(samples);
    }

    const merged = statsByStrategy['merged'] ?? [];
    const perLayer = statsByStrategy['perLayerTimed'] ?? [];
    return {
      scenario: scenario.name,
      viewport: VIEWPORT,
      dpr: options.dpr,
      frames: options.frames,
      merged,
      perLayer,
      floors: floorsOf(merged, perLayer, slotGroups),
    };
  } finally {
    await context.close();
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  const selected =
    options.scenarios.length === 0
      ? PERF_SCENARIOS
      : PERF_SCENARIOS.filter((s) => options.scenarios.includes(s.name));
  if (selected.length === 0) {
    throw new Error(
      `--scenario matched nothing — known: ${PERF_SCENARIOS.map((s) => s.name).join(', ')}`,
    );
  }

  const browser = await launchChromium();
  try {
    for (const scenario of selected) {
      console.log(`\nmeasuring '${scenario.name}' (${options.frames} frames @ dpr ${options.dpr}) ...`);
      const report = await measureScenario(browser, scenario, options);
      console.log(formatReport(report));
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
