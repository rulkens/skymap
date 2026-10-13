/**
 * dockTimeLabel — the dock Time item's label. It reads just "Time" only while
 * the clock is on real time AND running: pausing keeps `mode: 'live'`, so
 * `mode` alone would hide a frozen clock. Otherwise it shows the sim date (UTC)
 * and the run state; the year is dropped when it is `currentYear` so the label
 * fits a 320px dock cell, and the accessible name keeps it.
 */
import type { TimeState } from '../../@types/time/TimeState';
import type { DockTimeLabel } from '../../@types/time/DockTimeLabel';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function dockTimeLabel(
  time: Pick<TimeState, 'mode' | 'paused'>,
  instant: Date,
  currentYear: number,
): DockTimeLabel {
  if (time.mode === 'live' && !time.paused) return { text: 'Time', glyph: null, name: 'Time' };
  const dayMonth = `${instant.getUTCDate()} ${MONTHS[instant.getUTCMonth()]}`;
  const year = instant.getUTCFullYear();
  return {
    text: year === currentYear ? dayMonth : `${dayMonth} ${year}`,
    glyph: time.paused ? '❚❚' : '▶',
    name: `Time, ${dayMonth} ${year}, ${time.paused ? 'paused' : 'running'}`,
  };
}
