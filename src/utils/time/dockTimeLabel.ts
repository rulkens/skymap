/**
 * dockTimeLabel — the dock Time item's label. It reads just "Time" only while
 * the clock is on real time AND running: pausing keeps `mode: 'live'`, so
 * `mode` alone would hide a frozen clock. Otherwise it shows the sim date (UTC)
 * and the run state; the year is dropped when it is `currentYear` so the label
 * fits a 320px dock cell, and the accessible name keeps it. Past the Date range
 * (a far voyage) the date gives way to `formatSimClock`'s years since J2000.
 */
import type { TimeState } from '../../@types/time/TimeState';
import type { DockTimeLabel } from '../../@types/time/DockTimeLabel';
import { formatSimClock } from './formatSimClock';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function dockTimeLabel(
  time: Pick<TimeState, 'mode' | 'paused'>,
  unixMs: number,
  currentYear: number,
): DockTimeLabel {
  if (time.mode === 'live' && !time.paused) return { text: 'Time', glyph: null, name: 'Time' };
  const glyph = time.paused ? '❚❚' : '▶';
  const run = time.paused ? 'paused' : 'running';
  const instant = new Date(unixMs);
  if (Number.isNaN(instant.getTime())) {
    const years = formatSimClock(unixMs);
    return { text: years, glyph, name: `Time, ${years}, ${run}` };
  }
  const dayMonth = `${instant.getUTCDate()} ${MONTHS[instant.getUTCMonth()]}`;
  const year = instant.getUTCFullYear();
  return {
    text: year === currentYear ? dayMonth : `${dayMonth} ${year}`,
    glyph,
    name: `Time, ${dayMonth} ${year}, ${run}`,
  };
}
