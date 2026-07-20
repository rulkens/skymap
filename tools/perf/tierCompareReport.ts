/**
 * tierCompareReport — the structured result of a `--compare-tiers` run: ONE
 * scenario measured at every catalog tier (`small`/`medium`/`large`), with each
 * merged pass's median ms lined up across the tiers so the cost of resolution
 * is legible at a glance.
 *
 * A plain type module with no side effects, mirroring `scenarioReport.ts` and
 * `sweepReport.ts`, so BOTH the CDP harness (`measurePerf.ts`, which assembles a
 * report from live GPU timings across tier reloads) and the pure printer test
 * (`formatTierCompare.test.ts`, which hand-builds a fixture) can import it
 * without dragging in Playwright or a browser. The harness owns the aggregation;
 * `formatTierCompare` owns the rendering; this is the wire shape between them.
 *
 * ### Why a UNION of passes, not a fixed list
 *
 * A source can be excluded from a smaller tier entirely (SDSS is dropped from
 * `small`), so a render-step group that bills a slot at `large` may bill nothing
 * at `small`. `passes` is therefore the UNION of the merged group slots seen at
 * ANY tier, and each `perTierMs` cell is `null` where that pass produced no
 * samples at that tier — the printer renders the gap as `—` rather than a
 * misleading `0.0`. `total.perTierMs` has no such gap: every tier renders SOME
 * frame, so the whole-frame median is always a real number.
 */

import type { TimingSlotName } from '../../src/@types/gpu/timing/TimingSlotName';

/** One merged pass compared across the report's tiers. */
export type TierComparePass = {
  slot: TimingSlotName;
  /** Median ms at each tier, aligned to the report's `tiers`; null = the pass
   *  produced no samples at that tier (e.g. a source excluded from `small`). */
  perTierMs: readonly (number | null)[];
};

export type TierCompareReport = {
  scenario: string;
  viewport: { width: number; height: number };
  dpr: number;
  frames: number;
  /** The tiers measured, in order — `['small', 'medium', 'large']`. Plain
   *  `string[]` keeps tools/ from importing the src `Tier` type. */
  tiers: readonly string[];
  /** Merged-strategy group rows, unioned across tiers (see module header). */
  passes: readonly TierComparePass[];
  /** The whole-frame median per tier — always a real number, never null. */
  total: { perTierMs: readonly number[] };
  /** Raw page console.error / pageerror messages captured across the tier
   *  contexts, in arrival order. Rendered as a ⚠ summary by formatTierCompare. */
  pageErrors: readonly string[];
};
