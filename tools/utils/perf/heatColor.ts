/**
 * heatColor — pick a per-PASS heat colorizer for a single median ms value, so a
 * table of pass timings reads at a glance: dim (noise), green (cheap), yellow
 * (warm), red (hot). This is DISTINCT from `budgetTone`: that classifies a
 * whole FRAME against the refresh budget; this classifies ONE pass against
 * absolute "is this pass worth looking at" thresholds, which are far smaller
 * than a frame budget (a single 5 ms pass is already hot even though the frame
 * around it might still fit 60fps).
 *
 * ### Returns the colorizer, not a colored string
 *
 * The caller pads the cell to its column width FIRST, then wraps the padded cell
 * in this colorizer — because ANSI escapes inside a cell would corrupt the
 * `padStart`/`padEnd` width math (the escape bytes count toward `.length`).
 * Handing back the colorizer keeps "how wide is the cell" and "what color is the
 * cell" as two independent steps the caller sequences correctly. With a disabled
 * palette every band's colorizer is already the identity, so plain output is
 * byte-clean and still aligned.
 */

import type { Palette } from '../cli/ansiPalette';

/** Below this a pass is measurement jitter, not signal — dim it out of the way. */
const NOISE_MS = 0.3;
/** Comfortably cheap up to here — green. */
const WARM_MS = 2;
/** Warm up to here (yellow); at or beyond it the pass is hot — red. */
const HOT_MS = 5;

export function heatColor(medianMs: number, palette: Palette): (text: string) => string {
  if (medianMs < NOISE_MS) return palette.dim;
  if (medianMs < WARM_MS) return palette.green;
  if (medianMs < HOT_MS) return palette.yellow;
  return palette.red;
}
