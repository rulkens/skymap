/**
 * cpuPerf — main-thread ms per frame row (`plan:` / `compute:` / `draw:` /
 * `frame`), at the GPU harness's own poses. The GPU harness is blind to this
 * cost: it times render passes, not the JS that fills them.
 *
 *   npm run perf:cpu -- --url http://localhost:5174 --scenario star-field
 *
 * Flags: `--url` (default :5173), `--scenario` (repeatable; default all),
 * `--frames` (default 120), `--tier`, `--top` rows printed (default 12).
 * Headless Chromium on a dev box; a phone runs the same JS several times slower.
 */

import { launchChromium } from '../utils/browser/launchChromium';
import { bootHookedPage } from '../utils/browser/bootHookedPage';
import { warnIfWrongCheckout } from '../utils/browser/warnIfWrongCheckout';
import { median } from '../utils/perf/median';
import { percentile } from '../utils/perf/percentile';
import { PERF_SCENARIOS } from './perfScenarios';

const VIEWPORT = { width: 1400, height: 900 };

function flag(name: string): string[] {
  const out: string[] = [];
  process.argv.forEach((arg, i) => {
    if (arg === name && process.argv[i + 1] !== undefined) out.push(process.argv[i + 1]!);
  });
  return out;
}

async function main(): Promise<void> {
  const url = (flag('--url')[0] ?? 'http://localhost:5173').replace(/\/$/, '');
  const frames = Number(flag('--frames')[0] ?? 120);
  const top = Number(flag('--top')[0] ?? 12);
  const tier = flag('--tier')[0] ?? null;
  const names = flag('--scenario');
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
        const { rows, actualTier } = await page.evaluate(
          async (args) => {
            const hook = (
              window as unknown as {
                __skymapPerf: {
                  setPose: (p: typeof args.pose) => Promise<void>;
                  setTier: (t: string) => Promise<void>;
                  getTier: () => string;
                  collectCpu: (n: number) => Promise<Record<string, number>[]>;
                };
              }
            ).__skymapPerf;
            if (args.tier !== null) await hook.setTier(args.tier);
            await hook.setPose(args.pose);
            return { rows: await hook.collectCpu(args.frames), actualTier: hook.getTier() };
          },
          { pose: scenario.pose, frames, tier },
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
            median: median(ms),
            p90: percentile(ms, 90),
          }))
          .sort((a, b) => b.mean - a.mean);
        console.log(`\n${scenario.name}  (tier ${actualTier}, ${rows.length} frames)`);
        console.log(
          `  ${'row'.padEnd(34)} ${'mean'.padStart(8)} ${'median'.padStart(8)} ${'p90'.padStart(8)}  ms`,
        );
        for (const s of stats) {
          if (stats.indexOf(s) >= top && !s.name.includes('star')) continue;
          console.log(
            `  ${s.name.padEnd(34)} ${s.mean.toFixed(3).padStart(8)} ${s.median.toFixed(3).padStart(8)} ${s.p90.toFixed(3).padStart(8)}`,
          );
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
