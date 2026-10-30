import { SATELLITE_SWEEP_TIMING } from '../../../data/satellites/satelliteSweepTiming';

/** Opacity of the uploaded sweep by its absolute sim age: full, then a linear fade to nothing. */
export function sweepAgeOpacity(simAgeMs: number): number {
  const { fullDrawSimAgeMs, drawFadeSimAgeMs } = SATELLITE_SWEEP_TIMING;
  const t = (simAgeMs - fullDrawSimAgeMs) / drawFadeSimAgeMs;
  return Math.min(1, Math.max(0, 1 - t));
}
