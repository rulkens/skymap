/**
 * measurePerf — the headless GPU-timing harness: drive skymap to a fixed camera
 * pose in real Chromium, sample per-pass GPU timings for both encode
 * strategies, and print a per-scenario table with a per-pass floor estimate.
 *
 *   npm run perf                                  # all scenarios, 30 frames, dpr 2
 *   npm run perf -- --scenario solar-system --frames 10
 *   npm run perf -- --tier large                  # measure at the large catalog tier
 *   npm run perf -- --compare-tiers               # each scenario at small/medium/large
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
 * `record.ts` pauses page time via CDP virtual time so a slow 4K frame
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

import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { PERF_SCENARIOS, type PerfScenario } from './perfScenarios';
import type { ScenarioReport, LayerStat } from './scenarioReport';
import type { SweepReport, SweepScale, SweepPass } from './sweepReport';
import type { TierCompareReport, TierComparePass } from './tierCompareReport';
import { statsOf } from '../utils/perf/statsOf';
import { floorsOf } from '../utils/perf/floorsOf';
import { frameTotals } from '../utils/perf/frameTotals';
import { median } from '../utils/perf/median';
import { percentile } from '../utils/perf/percentile';
import { formatReport } from '../utils/perf/formatReport';
import { formatRunSummary } from '../utils/perf/formatRunSummary';
import { formatSweep } from '../utils/perf/formatSweep';
import { formatTierCompare } from '../utils/perf/formatTierCompare';
import { scalingExponent } from '../utils/perf/scalingExponent';
import { classifyBound } from '../utils/perf/classifyBound';
import { ansiPalette } from '../utils/cli/ansiPalette';
import type { PerfSample } from '../../src/@types/perf/PerfSample';
import type { Tier } from '../../src/@types/data/Tier';

// Fixed viewport for every non-sweep run: pixel area is part of what determines
// pass cost, so it stays constant across scenarios and only --dpr scales the
// backing store. --sweep deliberately varies the viewport (see SWEEP_SCALES).
const VIEWPORT = { width: 1400, height: 900 };

// The viewport multipliers --sweep measures each scenario at. Areas ≈
// 0.25/1/2.25/4× span ~16×, enough spread for an honest log-log slope fit while
// keeping the run to four contexts per scenario. dpr stays fixed at
// options.dpr — the app clamps its backing store to min(dpr, 2), so viewport is
// the only lever that raises pixel count without a ceiling (see sweepReport).
const SWEEP_SCALES = [0.5, 1.0, 1.5, 2.0] as const;

// The two encode strategies the hook can flip between. `merged` bills one
// timing slot per render-step GROUP (the production shape); `perLayerTimed`
// bills one slot per individual layer (the attribution shape). Running both is
// what makes the floor estimate possible.
const STRATEGIES = ['merged', 'perLayerTimed'] as const;

// The catalog tiers `--tier` validates against and `--compare-tiers` walks. No
// exported runtime tiers array exists to reuse (each builder defines its own
// module-local `TIER_ORDER`/`TIERS` — see buildAllBins.ts, clampTier.ts), so
// this mirrors that local-const pattern rather than inventing a shared export
// the harness would be the only extra consumer of.
const TIERS: readonly Tier[] = ['small', 'medium', 'large'];

type PerfOptions = {
  /** Scenario name filter; empty = all of PERF_SCENARIOS. */
  scenarios: string[];
  dpr: number;
  frames: number;
  url: string;
  /** Emit the raw report array as JSON on stdout instead of pretty tables. */
  json: boolean;
  /** Sweep each scenario across SWEEP_SCALES and classify each pass fragment/
   *  vertex-bound, instead of the single-viewport merged+per-layer run. */
  sweep: boolean;
  /** Hot-swap every scenario's page to this catalog tier before sampling;
   *  null = leave the boot tier (`medium` at the harness viewport). */
  tier: Tier | null;
  /** Measure each scenario at ALL tiers and print a per-pass comparison table,
   *  instead of the single-tier run. Conflicts with --tier and --sweep. */
  compareTiers: boolean;
};

/**
 * Bespoke argv loop rather than tools/utils/cli/args.ts: parseFlags is
 * deliberately boolean-only, and string/number/repeatable flags need per-script
 * handling. `--scenario` is repeatable (each occurrence appends a filter).
 */
function parseArgs(argv: readonly string[]): PerfOptions {
  const options: PerfOptions = {
    scenarios: [],
    dpr: 2,
    frames: 30,
    url: 'http://localhost:5173',
    json: false,
    sweep: false,
    tier: null,
    compareTiers: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--sweep') {
      options.sweep = true;
    } else if (arg === '--compare-tiers') {
      options.compareTiers = true;
    } else if (
      arg === '--scenario' ||
      arg === '--dpr' ||
      arg === '--frames' ||
      arg === '--url' ||
      arg === '--tier'
    ) {
      const value = argv[++i];
      if (value === undefined) throw new Error(`${arg} requires a value`);
      if (arg === '--scenario') options.scenarios.push(value);
      if (arg === '--dpr') {
        options.dpr = Number(value);
        if (options.dpr !== 1 && options.dpr !== 2) {
          throw new Error(
            '--dpr must be 1 or 2 — the app clamps its backing store to min(devicePixelRatio, 2); see device.ts',
          );
        }
      }
      if (arg === '--frames') {
        options.frames = Number(value);
        if (!Number.isInteger(options.frames) || options.frames < 1) {
          throw new Error(`--frames must be a positive integer, got '${value}'`);
        }
      }
      if (arg === '--url') options.url = value.replace(/\/$/, '');
      if (arg === '--tier') {
        if (!TIERS.includes(value as Tier)) {
          throw new Error(`unknown tier '${value}' (known: ${TIERS.join(', ')})`);
        }
        options.tier = value as Tier;
      }
    } else {
      throw new Error(
        `unknown flag '${arg}' (known: --scenario, --dpr, --frames, --url, --tier, --json, --sweep, --compare-tiers)`,
      );
    }
  }
  // Conflicting modes: --compare-tiers walks all tiers itself, so pinning one
  // tier or sweeping viewports alongside it is contradictory. Reject eagerly
  // rather than silently letting one win.
  if (options.compareTiers && options.sweep) {
    throw new Error('--compare-tiers conflicts with --sweep');
  }
  if (options.compareTiers && options.tier !== null) {
    throw new Error('--tier conflicts with --compare-tiers');
  }
  return options;
}

/**
 * Launch pattern mirrored from record.ts: the 'chromium' channel first (full
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

/**
 * bootPerfPage — open a page in `context`, wire the page-error collectors, wait
 * for the `__skymapPerf` hook + its `ready` gate, and read the `slotGroups`
 * map. Returns everything a measurement path needs to start sampling.
 *
 * Extracted so BOTH the single-viewport `measureScenario` and the multi-scale
 * `measureSweep` boot identically — the sequence (handlers, `goto ?perf`, wait
 * for hook, await `ready`, snapshot `slotGroups`) is the exact contract the app
 * seam expects, and duplicating it invites the two paths to drift.
 *
 * Page errors are collected rather than warned inline: a noisy page would spam
 * stderr and (in --json mode) risk leaking onto stdout. The formatters collapse
 * them to a ⚠ summary; JSON mode surfaces them raw. Mirrors record.ts's
 * handlers, but stores instead of printing. The returned `pageErrors` array is
 * live — it keeps filling as the page runs, so callers read it AFTER sampling.
 */
async function bootPerfPage(
  context: BrowserContext,
  url: string,
): Promise<{ page: Page; slotGroups: Record<string, string>; pageErrors: string[] }> {
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(`error: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') pageErrors.push(`console.error: ${msg.text()}`);
  });

  await page.goto(`${url}/?perf`, { waitUntil: 'load' });
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
  return { page, slotGroups, pageErrors };
}

/**
 * applyTier — when `tier` is non-null, hot-swap the page onto it and await the
 * reload settling; then ALWAYS read the store's ACTUAL tier back for the report.
 *
 * The read-back — NOT the flag — is what the report carries: a run without
 * `--tier` still records whatever tier the page booted at (`medium` at this
 * viewport), and a report can never claim a tier that wasn't actually measured.
 *
 * The `setTier` evaluate mirrors `setPose`/`setStrategy`: serialize the argument,
 * await the returned promise. There is no artificial timeout to set — a bare
 * `page.evaluate` awaits its JS promise with no deadline, which is exactly the
 * "generous timeout" a tier switch needs while it fetches tens of MB of bins
 * before the hook's `whenStablyReady` resolves.
 */
async function applyTier(page: Page, tier: Tier | null): Promise<string> {
  if (tier !== null) {
    await page.evaluate(
      (t) =>
        (
          window as unknown as { __skymapPerf: { setTier: (tier: string) => Promise<void> } }
        ).__skymapPerf.setTier(t),
      tier,
    );
  }
  return (await page.evaluate(() =>
    (window as unknown as { __skymapPerf: { getTier: () => string } }).__skymapPerf.getTier(),
  )) as string;
}

/**
 * sampleStrategy — flip the encode strategy, hard-cut to `pose`, and collect
 * `frames` frames of per-pass timings. The evaluate body is the app-seam
 * protocol: setStrategy (next-frame flip) → setPose (hard-cut + arm auto-rotate,
 * resolves on the next rAF) → collectTimings (subscribe, accumulate, resolve).
 * Auto-rotate keeps the render-on-demand loop awake for the whole sampling
 * window with no manual pump. Shared by both measurement paths.
 */
async function sampleStrategy(
  page: Page,
  strategy: string,
  pose: PerfScenario['pose'],
  frames: number,
): Promise<PerfSample[]> {
  return (await page.evaluate(
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
    { strategy, pose, frames },
  )) as PerfSample[];
}

/**
 * Measure ONE scenario: boot the perf page in a fresh context, sample both
 * strategies, and assemble the report. The context is closed by the caller.
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
    const { page, slotGroups, pageErrors } = await bootPerfPage(context, options.url);
    // Apply --tier (if any) before sampling, then read the actual tier back for
    // the report — see applyTier.
    const tier = await applyTier(page, options.tier);

    const statsByStrategy: Record<string, LayerStat[]> = {};
    // Per-frame totals per strategy: the sum of every slot on a frame, then the
    // median/p90 OF those per-frame sums — the honest "GPU cost per frame". Kept
    // separate from `statsByStrategy` (per-slot) because summing per-slot medians
    // mixes frames and inflates (see frameTotals). Empty samples → zeroed.
    const totalsByStrategy: Record<string, { median: number; p90: number }> = {};
    for (const strategy of STRATEGIES) {
      const samples = await sampleStrategy(page, strategy, scenario.pose, options.frames);
      statsByStrategy[strategy] = statsOf(samples);
      const t = frameTotals(samples);
      totalsByStrategy[strategy] =
        t.length === 0 ? { median: 0, p90: 0 } : { median: median(t), p90: percentile(t, 90) };
    }

    const merged = statsByStrategy['merged'] ?? [];
    const perLayer = statsByStrategy['perLayerTimed'] ?? [];
    const zeroTotal = { median: 0, p90: 0 };
    return {
      scenario: scenario.name,
      viewport: VIEWPORT,
      dpr: options.dpr,
      frames: options.frames,
      tier,
      totals: {
        merged: totalsByStrategy['merged'] ?? zeroTotal,
        perLayer: totalsByStrategy['perLayerTimed'] ?? zeroTotal,
      },
      merged,
      perLayer,
      floors: floorsOf(merged, perLayer, slotGroups),
      pageErrors,
    };
  } finally {
    await context.close();
  }
}

/**
 * measureSweep — measure ONE scenario at every SWEEP_SCALES viewport and fit
 * each merged pass's GPU-time-vs-pixels slope, so it can be labelled
 * fragment/fill-bound vs vertex/CPU-bound (see scalingExponent + classifyBound).
 *
 * Runs the MERGED strategy ONLY: it is the production pass shape, and sampling
 * one strategy per scale keeps the sweep to |scales| contexts rather than
 * |scales|×|strategies|. Each scale is a fresh context at the scaled viewport
 * (dpr held at options.dpr — viewport, not dpr, is the pixel-count lever the app
 * doesn't clamp). Per scale we keep each group's median ms and the whole-frame
 * total median; the slope is fitted over `{ x: pixels, y: median ms }`.
 */
async function measureSweep(
  browser: Browser,
  scenario: PerfScenario,
  options: PerfOptions,
): Promise<SweepReport> {
  const scales: SweepScale[] = [];
  const pageErrors: string[] = [];
  // Per scale, index-aligned to `scales`: the merged per-group stats and the
  // whole-frame total median.
  const mergedByScale: LayerStat[][] = [];
  const totalMedianByScale: number[] = [];
  // The actual tier every scale measures at (each scale's boot applies the same
  // --tier); all scales agree, so the last read-back stands for the report.
  let tier = 'medium';

  for (const scale of SWEEP_SCALES) {
    const width = Math.round(VIEWPORT.width * scale);
    const height = Math.round(VIEWPORT.height * scale);
    // Backing-store pixels: the app renders client size × clamped dpr, and dpr is
    // held fixed here, so pixel count is client area × dpr² (see sweepReport).
    const pixels = width * height * options.dpr * options.dpr;
    scales.push({ scale, width, height, pixels });

    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: options.dpr,
    });
    try {
      const boot = await bootPerfPage(context, options.url);
      tier = await applyTier(boot.page, options.tier);
      const samples = await sampleStrategy(boot.page, 'merged', scenario.pose, options.frames);
      mergedByScale.push(statsOf(samples));
      const t = frameTotals(samples);
      totalMedianByScale.push(t.length === 0 ? 0 : median(t));
      pageErrors.push(...boot.pageErrors);
    } finally {
      await context.close();
    }
  }

  // Union of group slots across scales, in first-seen order — a slot absent at
  // one scale reads 0 ms there (filtered out of the fit by scalingExponent).
  const slotOrder: string[] = [];
  const seen = new Set<string>();
  for (const stats of mergedByScale) {
    for (const stat of stats) {
      if (!seen.has(stat.slot)) {
        seen.add(stat.slot);
        slotOrder.push(stat.slot);
      }
    }
  }

  const passes: SweepPass[] = slotOrder.map((slot) => {
    const perScaleMs = mergedByScale.map(
      (stats) => stats.find((stat) => stat.slot === slot)?.median ?? 0,
    );
    const exponent = scalingExponent(scales.map((sc, i) => ({ x: sc.pixels, y: perScaleMs[i]! })));
    return { slot, perScaleMs, exponent, label: classifyBound(exponent) };
  });

  const totalExponent = scalingExponent(
    scales.map((sc, i) => ({ x: sc.pixels, y: totalMedianByScale[i]! })),
  );
  return {
    scenario: scenario.name,
    dpr: options.dpr,
    frames: options.frames,
    tier,
    scales,
    passes,
    total: {
      perScaleMs: totalMedianByScale,
      exponent: totalExponent,
      label: classifyBound(totalExponent),
    },
    pageErrors,
  };
}

/**
 * measureTierCompare — measure ONE scenario at EVERY tier and line up each
 * merged pass's median ms across the tiers, so the cost of resolution is legible.
 *
 * Each tier is a fresh context at the STANDARD viewport (unlike --sweep, which
 * scales the viewport — here the pixel count is FIXED and the DATA volume is the
 * variable). Per tier: boot, hot-swap onto the tier (yes, even `medium` — a
 * uniform code path whose same-tier no-op resolves fast), sample the MERGED
 * strategy only (the production pass shape), and keep the per-group medians + the
 * whole-frame total median.
 *
 * Then union the group slots across tiers: a slot absent at a tier reads `null`
 * (a source excluded from that tier billed nothing there), NOT 0 — the printer
 * renders the gap as `—`. The whole-frame total has no such gap: every tier
 * renders some frame, so its median is always a real number.
 */
async function measureTierCompare(
  browser: Browser,
  scenario: PerfScenario,
  options: PerfOptions,
): Promise<TierCompareReport> {
  const pageErrors: string[] = [];
  // Per tier, index-aligned to TIERS: merged per-group stats + whole-frame median.
  const mergedByTier: LayerStat[][] = [];
  const totalMedianByTier: number[] = [];

  for (const tier of TIERS) {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: options.dpr,
    });
    try {
      const boot = await bootPerfPage(context, options.url);
      // Always hot-swap, even to `medium`: a uniform code path, no per-tier
      // branch. applyTier's same-tier no-op resolves fast after the debounce.
      await applyTier(boot.page, tier);
      const samples = await sampleStrategy(boot.page, 'merged', scenario.pose, options.frames);
      mergedByTier.push(statsOf(samples));
      const t = frameTotals(samples);
      totalMedianByTier.push(t.length === 0 ? 0 : median(t));
      pageErrors.push(...boot.pageErrors);
    } finally {
      await context.close();
    }
  }

  // Union of group slots across tiers, in first-seen order — a slot absent at a
  // tier reads `null` there (never billed), which the printer renders as `—`.
  const slotOrder: string[] = [];
  const seen = new Set<string>();
  for (const stats of mergedByTier) {
    for (const stat of stats) {
      if (!seen.has(stat.slot)) {
        seen.add(stat.slot);
        slotOrder.push(stat.slot);
      }
    }
  }

  const passes: TierComparePass[] = slotOrder.map((slot) => ({
    slot,
    perTierMs: mergedByTier.map(
      (stats) => stats.find((stat) => stat.slot === slot)?.median ?? null,
    ),
  }));

  return {
    scenario: scenario.name,
    viewport: VIEWPORT,
    dpr: options.dpr,
    frames: options.frames,
    tiers: TIERS,
    passes,
    total: { perTierMs: totalMedianByTier },
    pageErrors,
  };
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

  // Color is a terminal-only affordance: never in JSON mode (stdout must be
  // pure JSON), never when piped (stdout isn't a TTY), never when NO_COLOR asks
  // us to abstain. This is the ONE place TTY/env is read — formatReport stays
  // pure by taking the resulting palette as data.
  const color = process.stdout.isTTY === true && !process.env.NO_COLOR && !options.json;
  const palette = ansiPalette(color);

  const browser = await launchChromium();
  // In JSON mode stdout carries exactly one thing — the full report array,
  // stringified at the very end. Progress goes to stderr so a `> out.json`
  // redirect stays parseable; a scenario that fails is simply absent from the
  // array (its error is logged to stderr).
  const reports: ScenarioReport[] = [];
  const sweeps: SweepReport[] = [];
  const tierCompares: TierCompareReport[] = [];
  // Human non-sweep roll-up accumulators: the successfully measured reports and
  // the names of scenarios that crashed. Kept separate from the JSON `reports`
  // (which stays untouched output) so the terminal roll-up can name failures the
  // JSON array simply omits.
  const humanReports: ScenarioReport[] = [];
  const failedScenarios: string[] = [];
  try {
    // Isolate each scenario: a dev-server hiccup or page crash on one vantage
    // shouldn't abort the whole sweep. Log it, mark the run failed, move on.
    for (const scenario of selected) {
      // Progress → stderr always, so it never contaminates JSON stdout and
      // interleaves cleanly with the pretty tables on a terminal.
      const mode = options.sweep
        ? `sweep ${SWEEP_SCALES.join('/')}×`
        : options.compareTiers
          ? `tier compare ${TIERS.join('/')}`
          : `${options.frames} frames`;
      console.error(`\nmeasuring '${scenario.name}' (${mode} @ dpr ${options.dpr}) ...`);
      try {
        if (options.sweep) {
          const report = await measureSweep(browser, scenario, options);
          if (options.json) sweeps.push(report);
          else console.log(formatSweep(report, palette));
        } else if (options.compareTiers) {
          const report = await measureTierCompare(browser, scenario, options);
          if (options.json) tierCompares.push(report);
          else console.log(formatTierCompare(report, palette));
        } else {
          const report = await measureScenario(browser, scenario, options);
          if (options.json) reports.push(report);
          else {
            console.log(formatReport(report, palette));
            humanReports.push(report);
          }
        }
      } catch (err) {
        console.error(
          `scenario '${scenario.name}' failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exitCode = 1;
        failedScenarios.push(scenario.name);
      }
    }
    if (options.json) {
      // One JSON array on stdout — the shape depends on the mode. compare-tiers
      // has no ALL-SCENARIOS roll-up (its verdict is per-tier — YAGNI).
      const payload = options.sweep ? sweeps : options.compareTiers ? tierCompares : reports;
      console.log(JSON.stringify(payload, null, 2));
    }
    // Cross-scenario roll-up: only the human, single-tier, non-sweep path, and
    // only when more than one scenario ran — a single-scenario run would just
    // duplicate its one TOTAL. formatRunSummary itself no-ops on an empty pair.
    else if (!options.sweep && !options.compareTiers && selected.length > 1) {
      console.log(formatRunSummary(humanReports, failedScenarios, palette));
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
