/**
 * useDwellElapsed — seconds of the current dwell that have played, driven by
 * requestAnimationFrame timestamp deltas rather than CSS animation delays: the
 * cinema recorder steps rAF in virtual time but never elapses multi-second CSS
 * delays. Frozen while paused, reset when `dwellNonce` changes (a new dwell).
 */
import { useEffect, useRef, useState } from 'react';

export function useDwellElapsed(dwellNonce: number, paused: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  const accSec = useRef(0);

  useEffect(() => {
    accSec.current = 0;
    setElapsed(0);
  }, [dwellNonce]);

  useEffect(() => {
    if (paused) return;
    let lastMs: number | null = null;
    let id = 0;
    const tick = (nowMs: number) => {
      if (lastMs !== null) {
        accSec.current += (nowMs - lastMs) / 1000;
        setElapsed(accSec.current);
      }
      lastMs = nowMs;
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [dwellNonce, paused]);

  return elapsed;
}
