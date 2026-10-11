/**
 * dockTimeLabel — the dock Time item's label. `live` is the same predicate
 * TimeBar uses to fold away its "Now" button: while it holds, the clock is on
 * real time and the item reads just "Time". Off it, the item shows the sim
 * date (UTC, like the full readout) and whether the clock is running.
 */
import type { TimeState } from '../../@types/time/TimeState';
import type { DockTimeLabel } from '../../@types/time/DockTimeLabel';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function dockTimeLabel(
  time: Pick<TimeState, 'mode' | 'paused'>,
  instant: Date,
): DockTimeLabel {
  if (time.mode === 'live') return { text: 'Time', glyph: null };
  const text = `${instant.getUTCDate()} ${MONTHS[instant.getUTCMonth()]} ${instant.getUTCFullYear()}`;
  return { text, glyph: time.paused ? '❚❚' : '▶' };
}
