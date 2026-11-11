/** Absolute-position style for a mark spanning `startSec`-`endSec` of the visible window. */
import { timeToPercent } from './window/timeToPercent';
import type { CSSProperties } from 'react';
import type { TimeWindow } from '../../@types/session/TimeWindow';

export function spanStyle(startSec: number, endSec: number, window: TimeWindow): CSSProperties {
  const left = timeToPercent(startSec, window);
  return { left: `${left}%`, width: `${timeToPercent(endSec, window) - left}%` };
}
