/**
 * useSimInstant — the sim clock's instant (Unix ms) at minute resolution,
 * re-derived on intent change and once per second in between. The engine's
 * throttled pubs carry no clock, hence the local tick. Every readout shows whole
 * minutes, so the same minute keeps the previous value: React bails out and a
 * paused or idle clock re-renders nothing, a running one once a minute. A number,
 * not a Date: a far voyage's Earth clock leaves the Date range.
 */
import { useEffect, useState } from 'react';
import type { TimeState } from '../@types/time/TimeState';
import { deriveSimDays } from '../utils/time/deriveSimDays';
import { julianDaysToUnixMs } from '../utils/time/julianDaysToUnixMs';

const MS_PER_MINUTE = 60_000;

// The `deriveSimDays` base MUST be `performance.now()`: `anchor.realMs` is one
// of its stamps, `Date.now()` is not. The modulo form handles pre-1970 dates.
function minuteInstant(time: TimeState): number {
  const ms = julianDaysToUnixMs(deriveSimDays(time, performance.now()));
  return ms - (((ms % MS_PER_MINUTE) + MS_PER_MINUTE) % MS_PER_MINUTE);
}

export function useSimInstant(time: TimeState): number {
  const [instant, setInstant] = useState(() => minuteInstant(time));

  useEffect(() => {
    const update = () => setInstant(minuteInstant(time));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [time]);

  return instant;
}
