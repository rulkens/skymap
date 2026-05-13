/**
 * Sparkline — 8-level unicode-block sparkline for inline numerics.
 *
 * Maps each sample to one of 8 Unicode block characters
 * (`▁▂▃▄▅▆▇█`), proportional to the sample's position in the range
 * `[0, max(samples)]`.  When `max === 0` (every sample is zero), the
 * lowest block (`▁`) is used uniformly — distinguishing "no signal"
 * from "no samples" (which returns an empty `<span>`).
 *
 * ### Why a `<span>` wrapper rather than a string-returning helper
 *
 * Two consumers want this widget: the live GPU-timings rows AND the
 * future per-source loading rows (if we revisit `LoadingDevPanel`'s
 * progress visualisation).  Wrapping the unicode in a `<span>` lets
 * each consumer style the colour / font separately via className or
 * inline style without changing the data path.  It also matches the
 * idiomatic React-component shape — consumers compose it like any
 * other element rather than worrying about whether the return value
 * is a string or a fragment.
 *
 * ### Why a fixed monospace font is implicit
 *
 * The block characters are designed to render at uniform width in a
 * monospace context.  We don't set `fontFamily` here because the
 * planned `GpuTimingsSection` wraps every row in a `font: '11px/1.4
 * ui-monospace, monospace'` block already; setting it again would be
 * redundant and would also override any future consumer that wanted a
 * different monospace face.
 *
 * ### Why `Math.round` and a clamp to `[0, 7]`
 *
 * `Math.round` gives the closest bucket — `Math.floor` would visually
 * bias every sample down half a level.  The `Math.max/Math.min` clamp
 * handles the rare floating-point edge case where
 * `sample / denominator * 7` lands fractionally above 7 due to ULP
 * noise; without it, an indexing miss would yield `undefined` and a
 * blank cell.
 */

import type { ReactElement } from 'react';

const BLOCKS = '▁▂▃▄▅▆▇█';

export type SparklineProps = {
  /**
   * Up to 8 samples in chronological order; longer arrays are rendered
   * in full but typically clipped by callers (the GPU-timings panel
   * keeps a rolling window of 8 frames).
   */
  samples: readonly number[];
};

export function Sparkline({ samples }: SparklineProps): ReactElement {
  if (samples.length === 0) return <span />;

  const max = Math.max(...samples);
  // `max === 0` → every sample is zero → render uniform low blocks.
  // Avoids a divide-by-zero and keeps the "no signal" row visually
  // distinct from the "no samples" empty case.
  const denominator = max === 0 ? 1 : max;

  const chars: string[] = [];
  for (const sample of samples) {
    const bucket = Math.max(
      0,
      Math.min(7, Math.round((sample / denominator) * 7)),
    );
    chars.push(BLOCKS[bucket]!);
  }

  return <span>{chars.join('')}</span>;
}
