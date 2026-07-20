/**
 * scenarioReport — the structured result of measuring ONE perf scenario, plus
 * the per-slot stat it is built from.
 *
 * A plain type module with no side effects, so BOTH the CDP harness
 * (`measurePerf.ts`, which assembles a report from live GPU timings) and the
 * pure printer test (`formatReport.test.ts`, which hand-builds a fixture) can
 * import it without dragging in Playwright or a browser. The harness owns the
 * aggregation; `formatReport` owns the rendering; this is the wire shape
 * between them.
 *
 * The two stat lists mirror the two encode strategies the harness runs:
 * `merged` holds one row per render-step GROUP (`hdr·NEAR0`, …) — the
 * production pass shape, where a group draws in a single pass — and `perLayer`
 * holds one row per individual LAYER (`orbit-trails`, …) from the
 * split-per-layer run. `floors` is the derived attribution: for each group with
 * ≥2 layers, the estimated fixed per-pass overhead every layer pays, and each
 * layer's floor-subtracted "real" cost.
 */

import type { TimingSlotName } from '../../src/@types/gpu/timing/TimingSlotName';

/** One slot's aggregated cost over the sample window: median + p90 ms. */
export type LayerStat = { slot: TimingSlotName; median: number; p90: number };

export type ScenarioReport = {
  scenario: string;
  viewport: { width: number; height: number };
  dpr: number;
  frames: number;
  /** Per-frame total GPU pass time (median+p90 ms) for each strategy: merged is the
   *  production-shape number; perLayer is instrumented (inflated by per-pass overhead). */
  totals: {
    merged: { median: number; p90: number };
    perLayer: { median: number; p90: number };
  };
  /** Per-group rows (`hdr·NEAR0`, …) from the merged run. */
  merged: readonly LayerStat[];
  /** Per-layer rows (`orbit-trails`, …) from the perLayerTimed run. */
  perLayer: readonly LayerStat[];
  /** Per-group floor estimate + each layer's floor-subtracted real cost. */
  floors: readonly {
    groupKey: string;
    floor: number;
    reals: readonly { slot: TimingSlotName; real: number }[];
  }[];
  /** Raw page console.error / pageerror messages captured during the run, in
   *  arrival order. Human mode collapses them to a ⚠ summary; JSON mode surfaces
   *  them raw. */
  pageErrors: readonly string[];
};
