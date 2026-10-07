/**
 * cpuPerf — main-thread ms per frame row (`plan:` / `compute:` / `draw:`), at the GPU harness's own poses. The GPU harness is blind to this
 * cost: it times render passes, not the JS that fills them.
 *
 *   npm run perf:cpu -- --url http://localhost:5174 --scenario star-field
 *
 * Flags: `--url` (default :5173), `--scenario` (repeatable; default all),
 * `--frames` (default 120). Rows print slowest first; a phone runs this JS slower.
 */

import { launchChromium } from '../utils/browser/launchChromium';
import { bootHookedPage } from '../utils/browser/bootHookedPage';
import { warnIfWrongCheckout } from '../utils/browser/warnIfWrongCheckout';
import { argValue } from '../utils/cli/argValue';
import type { PerfWindow } from '../../src/state/perf/@types/PerfWindow';
import { PERF_SCENARIOS } from './perfScenarios';

const VIEWPORT = { width: 1400, height: 900 };

async function main(): Promise<void> {
  const argv = process.argv;
  const url = (argValue(argv, '--url') ?? 'http://localhost:5173').replace(/\/$/, '');
  const frames = Number(argValue(argv, '--frames') ?? 120);
  const names = argv.flatMap((arg, i) => (arg === '--scenario' ? [argv[i + 1] ?? ''] : []));
  const selected =
    names.length === 0 ? PERF_SCENARIOS : PERF_SCENARIOS.filter((s) => names.includes(s.name));
  if (selected.length === 0) throw new Error('--scenario matched nothing');

  const browser = await launchChromium();
  try {
    for (const scenario of selected) {
      const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
      try {
        const page = await context.newPage();
        await bootHookedPage(page, `${url}/?perf`);
        await warnIfWrongCheckout(page);
        const rows = await page.evaluate(
          async (args) => {
            const hook = (window as PerfWindow).__skymapPerf!;
            await hook.setPose(args.pose);
            return hook.collectCpu(args.frames);
          },
          { pose: scenario.pose, frames },
        );

        const byName = new Map<string, number[]>();
        for (const row of rows) {
          for (const [name, ms] of Object.entries(row)) {
            const list = byName.get(name) ?? [];
            list.push(ms);
            byName.set(name, list);
          }
        }
        const stats = [...byName]
          .map(([name, ms]) => ({
            name,
            // The clock ticks in 0.1 ms steps; only the mean resolves a row below that.
            mean: ms.reduce((a, b) => a + b, 0) / rows.length,
          }))
          .sort((a, b) => b.mean - a.mean);
        console.log(`\n${scenario.name}  (${rows.length} frames)`);
        console.log(`  ${'row'.padEnd(34)} ${'mean'.padStart(8)}  ms`);
        for (const s of stats) {
          console.log(`  ${s.name.padEnd(34)} ${s.mean.toFixed(3).padStart(8)}`);
        }
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
