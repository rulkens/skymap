/**
 * useSimInstant — the sim clock's instant at minute resolution, re-derived on
 * intent change and once per second in between. The engine's throttled pubs
 * carry no clock, hence the local tick. Every readout shows whole minutes, so
 * the same minute keeps the previous Date: React bails out and a paused or idle
 * clock re-renders nothing, a running one once a minute.
 */
import { useEffect, useState } from 'react';
import type { TimeState } from '../@types/time/TimeState';
import { deriveSimDays } from '../utils/time/deriveSimDays';
import { julianDaysToUnixMs } from '../utils/time/julianDaysToUnixMs';

const MS_PER_MINUTE = 60_000;

// The `deriveSimDays` base MUST be `performance.now()`: `anchor.realMs` is one
// of its stamps, `Date.now()` is not. The modulo form handles pre-1970 dates.
function minuteInstant(time: TimeState): Date {
  const ms = julianDaysToUnixMs(deriveSimDays(time, performance.now()));
  return new Date(ms - (((ms % MS_PER_MINUTE) + MS_PER_MINUTE) % MS_PER_MINUTE));
}

export function useSimInstant(time: TimeState): Date {
  const [instant, setInstant] = useState(() => minuteInstant(time));

  useEffect(() => {
    const update = () => {
      const next = minuteInstant(time);
      setInstant((prev) => (prev.getTime() === next.getTime() ? prev : next));
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [time]);

  return instant;
}
