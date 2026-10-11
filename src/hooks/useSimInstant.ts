/**
 * useSimInstant — the sim clock's instant, re-derived on intent change and once
 * per second in between, so a readout stays visibly alive without a per-frame
 * Redux write. The engine's throttled pubs carry no clock, hence the local tick.
 */
import { useEffect, useState } from 'react';
import type { TimeState } from '../@types/time/TimeState';
import { simInstant } from '../utils/time/simInstant';

export function useSimInstant(time: TimeState): Date {
  const [instant, setInstant] = useState(() => simInstant(time));

  useEffect(() => {
    const update = () => setInstant(simInstant(time));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [time]);

  return instant;
}
