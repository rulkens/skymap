/**
 * How far a bar's label is pushed in so it sticks to the window's left edge once the bar starts off
 * screen. In percent of the track, not the bar: CSS padding percentages resolve against the
 * containing block. Capped at the bar's width, since a border-box bar grows to fit its padding.
 */
import { timeToPercent } from './window/timeToPercent';
import type { TimeWindow } from '../../@types/session/TimeWindow';

export function stuckLabelInset(startSec: number, endSec: number, window: TimeWindow): number {
  const left = timeToPercent(startSec, window);
  return Math.min(timeToPercent(endSec, window) - left, Math.max(0, -left));
}
