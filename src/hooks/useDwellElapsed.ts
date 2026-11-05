/**
 * useDwellElapsed — seconds of the current dwell that have played, frozen while
 * paused and reset when `dwellNonce` changes (a new dwell). Ticked by a timer
 * reading `performance.now()`, not by rAF or CSS delays: under the recorder's
 * CDP virtual time, rAF and CSS animation timelines stall once the frame goes
 * quiet (~2 s into a dwell), while timers advance with the budget, as the
 * dwell saga's own `delay` does.
 */
import { useEffect, useRef, useState } from 'react';
import { SUBTITLE_TICK_MS } from '../data/animation/subtitleTiming';

export function useDwellElapsed(dwellNonce: number, paused: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  const accSec = useRef(0);

  useEffect(() => {
    accSec.current = 0;
    setElapsed(0);
  }, [dwellNonce]);

  useEffect(() => {
    if (paused) return;
    let lastMs = performance.now();
    const id = setInterval(() => {
      const nowMs = performance.now();
      accSec.current += (nowMs - lastMs) / 1000;
      lastMs = nowMs;
      setElapsed(accSec.current);
    }, SUBTITLE_TICK_MS);
    return () => {
      clearInterval(id);
      // Bank the partial tick so a pause loses nothing.
      accSec.current += (performance.now() - lastMs) / 1000;
    };
  }, [dwellNonce, paused]);

  return elapsed;
}
