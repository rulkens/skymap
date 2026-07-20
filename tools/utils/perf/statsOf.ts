/**
 * statsOf — roll a flat `PerfSample[]` sample stream up into one median+p90
 * `LayerStat` per slot.
 *
 * WHY it lives here rather than inline in `measurePerf.ts`: it is a pure
 * transform (samples → per-slot stats) with no Playwright or browser
 * dependency, so extracting it makes it unit-testable without a GPU (see
 * `statsOf.test.ts`) and keeps the harness's `measureScenario` down to "gather
 * data → aggregate → print". The alternative — leaving it private in the CDP
 * loop — buried a pure, easily-broken rollup (percentile choice, dropped slots)
 * behind a browser boundary no test could reach.
 *
 * The pivot-then-summarise split is deliberate: `groupSamplesBySlot` owns the
 * bucketing (and its arrival-order guarantee), `median`/`percentile` own the
 * type-7 interpolation, and this function only stitches them together.
 */

import { groupSamplesBySlot } from './groupSamplesBySlot';
import { median } from './median';
import { percentile } from './percentile';
import type { LayerStat } from '../../perf/scenarioReport';
import type { PerfSample } from '../../../src/@types/perf/PerfSample';

export function statsOf(samples: readonly PerfSample[]): LayerStat[] {
  const stats: LayerStat[] = [];
  for (const [slot, msList] of groupSamplesBySlot(samples)) {
    stats.push({ slot, median: median(msList), p90: percentile(msList, 90) });
  }
  return stats;
}
