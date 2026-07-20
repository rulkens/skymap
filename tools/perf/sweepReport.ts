/**
 * sweepReport — the structured result of a `--sweep` run: one scenario measured
 * at several VIEWPORT scales, with each pass's GPU-time-vs-pixels slope and the
 * bound classification derived from it.
 *
 * A plain type module with no side effects, mirroring `scenarioReport.ts`, so
 * BOTH the CDP harness (`measurePerf.ts`, which assembles a report from live GPU
 * timings across scaled contexts) and the pure printer test
 * (`formatSweep.test.ts`, which hand-builds a fixture) can import it without
 * dragging in Playwright or a browser. The harness owns the aggregation;
 * `formatSweep` owns the rendering; this is the wire shape between them.
 *
 * ### Why viewport scales, not dpr
 *
 * The app clamps its backing store to `min(devicePixelRatio, 2)` (device.ts),
 * so `--dpr` cannot sweep past 2×. But the page renders `clientSize × clamped-
 * dpr`, so scaling the Playwright VIEWPORT raises the pixel count without limit
 * while dpr stays fixed. Each `SweepScale` therefore records the scaled
 * `width`/`height` and the resulting `pixels = width · height · dpr²` that the
 * slope fit uses as its x-axis.
 */

import type { TimingSlotName } from '../../src/@types/gpu/timing/TimingSlotName';

/** One viewport scale in the sweep: the multiplier, the scaled client size, and
 *  the resulting backing-store pixel count (client area × dpr²). */
export type SweepScale = { scale: number; width: number; height: number; pixels: number };

/** One timed pass measured across every scale, plus its fitted slope + label. */
export type SweepPass = {
  slot: TimingSlotName;
  /** Median ms at each scale, index-aligned to `SweepReport.scales`. */
  perScaleMs: readonly number[];
  /** Log-log slope of ms vs pixels; `NaN` when unmeasurable (see scalingExponent). */
  exponent: number;
  /** `classifyBound(exponent)` — 'fragment/fill-bound' | 'mixed' | 'vertex/CPU-bound' | 'n/a'. */
  label: string;
};

export type SweepReport = {
  scenario: string;
  dpr: number;
  frames: number;
  /** The ACTUAL catalog tier read back from the store via `getTier()` after any
   *  `--tier` switch — plain `string`, mirroring `ScenarioReport.tier`. */
  tier: string;
  scales: readonly SweepScale[];
  passes: readonly SweepPass[];
  /** The whole-frame total, classified the same way as an individual pass. */
  total: { perScaleMs: readonly number[]; exponent: number; label: string };
  /** Raw page console.error / pageerror messages captured across the scale
   *  contexts, in arrival order. Rendered as a ⚠ summary by formatSweep. */
  pageErrors: readonly string[];
};
