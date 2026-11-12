import { ASTEROID_WINDOW as W } from '../data/asteroidWindow';
import { smoothstep } from '../../../../utils/math/smoothstep';

/** 0 outside `ASTEROID_WINDOW`, 1 inside it, with a smoothstep over the last `fadeDays` at each edge. */
export function asteroidWindowFade(simJd: number): number {
  return (
    smoothstep(W.startJd, W.startJd + W.fadeDays, simJd) *
    (1 - smoothstep(W.endJd - W.fadeDays, W.endJd, simJd))
  );
}
