/**
 * The window after zooming by `factor` (below 1 zooms in) about an anchor (the playhead for buttons
 * and keys, the pointer for the wheel): a visible anchor keeps its place on screen, an off-screen one
 * is centred, and the window is clamped to the clip, so the anchor always ends in view. Null once the
 * span covers the whole clip (Fit).
 */
import type { TimeWindow } from '../../../@types/session/TimeWindow';

/** The tightest view: below this a ruler has nothing left to show. */
const MIN_SPAN_SEC = 0.5;

export function zoomWindow(
  current: TimeWindow,
  fit: TimeWindow,
  factor: number,
  anchorSec: number,
): TimeWindow | null {
  const currentSpan = current.endSec - current.startSec;
  const span = Math.max(MIN_SPAN_SEC, currentSpan * factor);
  if (span >= fit.endSec - fit.startSec) return null;
  const visible = anchorSec >= current.startSec && anchorSec <= current.endSec;
  const at = visible ? (anchorSec - current.startSec) / currentSpan : 0.5;
  const startSec = Math.min(Math.max(fit.startSec, anchorSec - at * span), fit.endSec - span);
  return { startSec, endSec: startSec + span };
}
