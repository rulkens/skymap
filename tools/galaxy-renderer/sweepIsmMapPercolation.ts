/**
 * sweepIsmMapPercolation — where does the SSPSF automaton's percolation
 * threshold in `spread` actually sit, and what moves it?
 *
 *   npx tsx tools/galaxy-renderer/sweepIsmMapPercolation.ts [--runs N] [--steps N] [--json]
 *
 * With no override flag this runs the full built-in 11-sweep x 15-spread
 * matrix below, unchanged. Passing any of `--spread`/`--gasRegen`/
 * `--refractorySteps`/`--dustFloorFraction` instead runs ONE 'seeded' case at
 * that single parameter point (omitted knobs keep `DEFAULT_GALAXY_ISM_MAP_AUTOMATON_PARAMS`)
 * — the ad-hoc-point mode a shell sweep loop drives:
 *
 *   npx tsx tools/galaxy-renderer/sweepIsmMapPercolation.ts \
 *     --spread 0.23 --gasRegen 0.06 --refractorySteps 7 --dustFloorFraction 0.2 --steps 200 --runs 48
 *
 * Drives the REAL `ismMapAutomatonStep.wesl` compute pass in headless Chromium (the
 * page half is `src/percolation/ismMapPercolationHarness.ts`) rather than a CPU
 * port of the update rule — a percolation threshold is emergent and cannot be
 * read off a shader.
 *
 * Threshold, operationally: with `baseIgnition` and `armForcing` both 0 a run
 * can reach exactly zero activity, so seed ONE ignited cell and call the run
 * SURVIVING if any cell is still igniting on the last step. `p_c` is the
 * `spread` at which survival probability over `--runs` independent hash seeds
 * crosses 0.5, linearly interpolated between the two bracketing sweep points.
 *
 * Server/browser startup is deliberately the same shape as probeGpuErrors.ts:
 * self-hosted on an ephemeral port, chromium channel first. Pointing at a
 * running server is the worktree trap (tools/perf/README.md) — you measure
 * whichever branch started it.
 */
import { chromium, type Browser } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';

import type {
  IsmMapPercolationCase,
  IsmMapPercolationReport,
  IsmMapPercolationRequest,
  IsmMapPercolationResult,
} from './src/percolation/ismMapPercolationHarness';
import type { GalaxyIsmMapAutomatonParams } from '../../src/@types/galaxy/GalaxyIsmMapAutomatonParams';

/** `GalaxyIsmMapAutomatonParams`'s own fields are readonly (the params contract); this driver's CLI parse needs to build one up field-by-field. */
type MutableIsmMapOverrides = {
  -readonly [K in keyof GalaxyIsmMapAutomatonParams]?: GalaxyIsmMapAutomatonParams[K];
};

/**
 * A Milky-Way-shaped grid span (`ismMapGridRadius`: rMin = 0.6 * armStartRadius,
 * rMax = the outermost arm's fadeRadius). It reaches the automaton only through
 * the per-ring shear, so the `shear 0` control below is what isolates its
 * influence.
 */
const GRID = { rMin: 1.8, rMax: 15.5 };
/** Mid-grid, r ~ 5.3 — well off `corotationRadius` 7.9, where shear vanishes. */
const SEED_RING = 128;

type Options = {
  runs: number;
  steps: number;
  json: boolean;
  headed: boolean;
  overrides: MutableIsmMapOverrides;
};

function parseArgs(argv: readonly string[]): Options {
  const options: Options = { runs: 48, steps: 200, json: false, headed: false, overrides: {} };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') options.json = true;
    else if (arg === '--headed') options.headed = true;
    else if (arg === '--runs') options.runs = Number(argv[++i]);
    else if (arg === '--steps') options.steps = Number(argv[++i]);
    else if (arg === '--spread') options.overrides.spread = Number(argv[++i]);
    else if (arg === '--gasRegen') options.overrides.gasRegen = Number(argv[++i]);
    else if (arg === '--refractorySteps') options.overrides.refractorySteps = Number(argv[++i]);
    else if (arg === '--dustFloorFraction') options.overrides.dustFloorFraction = Number(argv[++i]);
    else
      throw new Error(
        `unknown flag '${arg}' (known: --runs, --steps, --spread, --gasRegen, --refractorySteps, --dustFloorFraction, --json, --headed)`,
      );
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

async function startDevServer(): Promise<{ server: ViteDevServer; url: string }> {
  const configFile = fileURLToPath(new URL('./vite.config.ts', import.meta.url));
  const server = await createServer({
    configFile,
    logLevel: 'warn',
    server: { port: await findFreePort(), strictPort: false },
  });
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (url === undefined) throw new Error('vite dev server started but resolved no local URL');
  return { server, url: url.replace(/\/$/, '') };
}

async function launchChromium(headed: boolean): Promise<Browser> {
  try {
    return await chromium.launch({ channel: 'chromium', headless: !headed });
  } catch {
    return chromium.launch({
      headless: !headed,
      args: ['--enable-unsafe-webgpu', '--use-angle=metal'],
    });
  }
}

/**
 * 0 is a control, not a data point: in 'seeded' mode it must never survive,
 * and in 'spontaneous' mode it IS the no-propagation floor every other row is
 * an amplification over.
 */
const SPREADS = [
  0, 0.1, 0.14, 0.164, 0.18, 0.19, 0.2, 0.21, 0.22, 0.23, 0.24, 0.25, 0.26, 0.28, 0.3,
];

/** One sweep of `spread` at a fixed setting of whatever knob is under test. */
type Sweep = {
  readonly name: string;
  readonly mode: 'seeded' | 'spontaneous';
  readonly held: Record<string, number>;
};

function sweepCases(sweep: Sweep): IsmMapPercolationCase[] {
  return SPREADS.map((spread) => ({
    label: `${sweep.name}|${spread}`,
    params: {
      ...sweep.held,
      spread,
      // 'seeded' measures propagation alone: no spontaneous ignition (so
      // activity CAN hit zero) and no arm term (so the only driver is the
      // neighbourhood).
      ...(sweep.mode === 'seeded' ? { baseIgnition: 0, armForcing: 0 } : { armForcing: 0 }),
    },
  }));
}

/** Survival probability crosses 0.5 between two sweep points; report where. */
function interpolateThreshold(results: readonly IsmMapPercolationResult[]): number | null {
  for (let i = 1; i < results.length; i++) {
    const below = results[i - 1]!;
    const above = results[i]!;
    const pBelow = below.survived / below.runs;
    const pAbove = above.survived / above.runs;
    if (pBelow < 0.5 && pAbove >= 0.5) {
      const t = (0.5 - pBelow) / (pAbove - pBelow);
      return below.params.spread + t * (above.params.spread - below.params.spread);
    }
  }
  return null;
}

function formatSweep(sweep: Sweep, results: readonly IsmMapPercolationResult[]): string[] {
  const lines: string[] = [];
  const floor = results[0]?.tailActiveFraction ?? 0;
  lines.push(`\n${sweep.name}  (${sweep.mode}, held: ${JSON.stringify(sweep.held)})`);
  lines.push(
    '  spread   survival   tail active frac   x floor   peak active frac   clusters   largest%',
  );
  for (const result of results) {
    const amplification = floor > 0 ? (result.tailActiveFraction / floor).toFixed(1) : '—';
    lines.push(
      `  ${result.params.spread.toFixed(3).padStart(6)}   ` +
        `${(result.survived / result.runs).toFixed(2).padStart(5)}      ` +
        `${result.tailActiveFraction.toExponential(2).padStart(10)}   ` +
        `${amplification.padStart(7)}       ` +
        `${result.peakActiveFraction.toExponential(2).padStart(10)}   ` +
        `${String(result.clusterCount).padStart(8)}   ` +
        `${(result.largestClusterShare * 100).toFixed(1).padStart(7)}%`,
    );
  }
  if (sweep.mode === 'spontaneous') {
    // The one closed-form prediction this model has: at spread 0 a cell that
    // essentially never ignites keeps gas at 1, so its ignition rate is
    // `baseIgnition` exactly. The measured floor over that is an end-to-end
    // check of the hash, the constants-uniform lane order and the census — if
    // `baseIgnition` were landing in the wrong lane this ratio would not be 1.
    const predicted = results[0]?.params.baseIgnition ?? 0;
    lines.push(
      `  plumbing check: floor / baseIgnition = ${(floor / predicted).toFixed(3)} (1.000 = exact)`,
    );
  }
  const threshold = interpolateThreshold(results);
  lines.push(
    threshold === null
      ? '  p_c: NOT BRACKETED by this spread range'
      : `  p_c = ${threshold.toFixed(4)}`,
  );
  return lines;
}

/**
 * One 'seeded' case at exactly the CLI-given point (omitted knobs keep
 * `DEFAULT_GALAXY_ISM_MAP_AUTOMATON_PARAMS` — `runIsmMapPercolation` does that merge
 * itself, see its own `params` line). This is the ad-hoc-point path a shell
 * sweep loop drives, as opposed to `main`'s own fixed 11-sweep matrix.
 */
async function runSingleCase(options: Options): Promise<void> {
  const request: IsmMapPercolationRequest = {
    mode: 'seeded',
    steps: options.steps,
    runs: options.runs,
    rMin: GRID.rMin,
    rMax: GRID.rMax,
    seedRing: SEED_RING,
    armForcingLevel: 0,
    cases: [
      {
        label: 'cli-override',
        // Same 'seeded' convention sweepCases uses: no spontaneous ignition,
        // no arm term, so only neighbourhood propagation is measured.
        params: { ...options.overrides, baseIgnition: 0, armForcing: 0 },
      },
    ],
  };

  const hosted = await startDevServer();
  const server: ViteDevServer = hosted.server;
  const browser = await launchChromium(options.headed);
  let report: IsmMapPercolationReport;

  try {
    const context = await browser.newContext({ viewport: { width: 400, height: 300 } });
    const page = await context.newPage();
    page.setDefaultTimeout(600_000);
    page.on('pageerror', (err) => console.error(`page error: ${err.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') console.error(`console: ${message.text()}`);
    });
    await page.goto(`${hosted.url}/ismMapPercolation.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => '__ismMapPercolation' in globalThis);

    report = (await page.evaluate(
      (arg) =>
        (
          globalThis as unknown as { __ismMapPercolation: (r: unknown) => Promise<unknown> }
        ).__ismMapPercolation(arg),
      request,
    )) as IsmMapPercolationReport;
    if (report.gpuErrors.length > 0) {
      throw new Error(`GPU rejected work:\n  ${report.gpuErrors.join('\n  ')}`);
    }
    await context.close();
  } finally {
    await browser.close();
    await server.close();
  }

  const result = report.results[0]!;
  console.log('\nSSPSF percolation — single point (CLI override)');
  console.log(`  adapter: ${report.adapter}`);
  console.log(`  ${options.steps} steps, ${options.runs} runs, grid ${JSON.stringify(GRID)}`);
  console.log(`  effective params: ${JSON.stringify(result.params)}`);
  console.log(
    `  survival ${(result.survived / result.runs).toFixed(2)}   ` +
      `tail active frac ${result.tailActiveFraction.toExponential(3)}   ` +
      `peak active frac ${result.peakActiveFraction.toExponential(3)}`,
  );
  console.log(
    `  clusters ${result.clusterCount}   largest-cluster share ${(result.largestClusterShare * 100).toFixed(1)}%`,
  );
  console.log(
    `RESULT ${JSON.stringify({
      mode: 'single',
      params: result.params,
      steps: options.steps,
      runs: options.runs,
      survived: result.survived,
      survivalFraction: result.survived / result.runs,
      tailActiveFraction: result.tailActiveFraction,
      peakActiveFraction: result.peakActiveFraction,
      clusterCount: result.clusterCount,
      largestClusterShare: result.largestClusterShare,
    })}`,
  );
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (Object.keys(options.overrides).length > 0) {
    await runSingleCase(options);
    return;
  }

  const sweeps: Sweep[] = [
    // The question: does gas starvation hold the threshold up?
    { name: 'gasRegen 0.06 (shipped)', mode: 'seeded', held: { gasRegen: 0.06 } },
    { name: 'gasRegen 0.3', mode: 'seeded', held: { gasRegen: 0.3 } },
    { name: 'gasRegen 1.0 (no starvation)', mode: 'seeded', held: { gasRegen: 1.0 } },
    // The other two candidates named in the same breath as gas.
    { name: 'refractory 0', mode: 'seeded', held: { gasRegen: 1.0, refractorySteps: 0 } },
    { name: 'refractory 1', mode: 'seeded', held: { gasRegen: 1.0, refractorySteps: 1 } },
    { name: 'refractory 3', mode: 'seeded', held: { gasRegen: 1.0, refractorySteps: 3 } },
    { name: 'refractory 15', mode: 'seeded', held: { gasRegen: 0.06, refractorySteps: 15 } },
    { name: 'shear 0', mode: 'seeded', held: { shearRate: 0 } },
    // With the shipped baseIgnition nothing ever dies, so the order parameter
    // is steady-state activity rather than survival.
    { name: 'spontaneous, gasRegen 0.06', mode: 'spontaneous', held: { gasRegen: 0.06 } },
    { name: 'spontaneous, gasRegen 1.0', mode: 'spontaneous', held: { gasRegen: 1.0 } },
  ];

  const hosted = await startDevServer();
  const server: ViteDevServer = hosted.server;
  const browser = await launchChromium(options.headed);
  const reports: { sweep: Sweep; report: IsmMapPercolationReport }[] = [];
  let adapterLine = 'NONE';

  try {
    const context = await browser.newContext({ viewport: { width: 400, height: 300 } });
    const page = await context.newPage();
    page.setDefaultTimeout(600_000);
    page.on('pageerror', (err) => console.error(`page error: ${err.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') console.error(`console: ${message.text()}`);
    });
    await page.goto(`${hosted.url}/ismMapPercolation.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => '__ismMapPercolation' in globalThis);

    for (const sweep of sweeps) {
      const request: IsmMapPercolationRequest = {
        mode: sweep.mode,
        steps: options.steps,
        // Spontaneous runs self-average over 196k cells, so repeats buy little.
        runs: sweep.mode === 'seeded' ? options.runs : 4,
        rMin: GRID.rMin,
        rMax: GRID.rMax,
        seedRing: SEED_RING,
        armForcingLevel: 0,
        cases: sweepCases(sweep),
      };
      const started = Date.now();
      // Anonymous on purpose: a NAMED function inside page-bound code compiles
      // under tsx/esbuild `keepNames` to a call to a `__name` helper that does
      // not exist in the page (probeGpuErrors.ts hit the same wall).
      const report = (await page.evaluate(
        (arg) =>
          (
            globalThis as unknown as { __ismMapPercolation: (r: unknown) => Promise<unknown> }
          ).__ismMapPercolation(arg),
        request,
      )) as IsmMapPercolationReport;
      adapterLine = report.adapter;
      if (report.gpuErrors.length > 0) {
        throw new Error(
          `GPU rejected work during '${sweep.name}':\n  ${report.gpuErrors.join('\n  ')}`,
        );
      }
      // The negative control: with no propagation and no spontaneous ignition
      // nothing can ever ignite, so a spontaneous run whose FLOOR is zero is a
      // harness fault, not a physical result.
      if (sweep.mode === 'spontaneous' && report.results[0]!.tailActiveFraction === 0) {
        throw new Error(
          `'${sweep.name}' measured zero activity at spread 0 — the census is not reading the automaton`,
        );
      }
      reports.push({ sweep, report });
      console.error(`  ✓ ${sweep.name} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
    }
    await context.close();
  } finally {
    await browser.close();
    await server.close();
  }

  // One record for the whole matrix, not one per case: a shell loop sweeping
  // this driver already gets one line per invocation from `runSingleCase`,
  // and 165 nested-object cases fit in a single JSON line just fine.
  const resultRecord = {
    mode: 'matrix',
    steps: options.steps,
    runs: options.runs,
    sweeps: reports.map(({ sweep, report }) => ({
      name: sweep.name,
      sweepMode: sweep.mode,
      held: sweep.held,
      results: report.results.map((r) => ({
        params: r.params,
        survived: r.survived,
        runs: r.runs,
        tailActiveFraction: r.tailActiveFraction,
        peakActiveFraction: r.peakActiveFraction,
        clusterCount: r.clusterCount,
        largestClusterShare: r.largestClusterShare,
      })),
    })),
  };

  if (options.json) {
    console.log(JSON.stringify({ adapter: adapterLine, options, reports }, null, 2));
    console.log(`RESULT ${JSON.stringify(resultRecord)}`);
    return;
  }

  console.log('\nSSPSF percolation sweep');
  console.log(`  adapter: ${adapterLine}`);
  console.log(`  ${options.steps} steps, ${options.runs} runs/point, grid ${JSON.stringify(GRID)}`);
  console.log('  survival = fraction of single-seed runs still igniting on the last step');
  for (const { sweep, report } of reports) {
    for (const line of formatSweep(sweep, report.results)) console.log(line);
  }
  console.log(`\nRESULT ${JSON.stringify(resultRecord)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
