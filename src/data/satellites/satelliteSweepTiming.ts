/**
 * When the satellites re-sweep (spec §5.5). The vertex stage's extrapolation, worst case over
 * 19,184 LEO objects on 2026-10-29: 1.1 km at 60 s, 4.7 km at 120 s, 13 km at 180 s, 29 km at
 * 240 s, 55 km at 300 s, 418 km at 600 s. A sweep is due a real second after the last one was
 * drawn (if the clock moved at all), or at once when the clock is `maxSimAgeMs` from it. The
 * dots stay fully drawn to `fullDrawSimAgeMs`, then fade over `drawFadeSimAgeMs`: a ~13 ms sweep
 * keeps 1 h/s at ~2-3 min old, and past ~2 h/s the dots fade out steadily instead of blinking.
 * The planner also wakes an idle frame loop after `realIntervalMs`.
 */
export const SATELLITE_SWEEP_TIMING = {
  realIntervalMs: 1_000,
  maxSimAgeMs: 30_000,
  fullDrawSimAgeMs: 300_000,
  drawFadeSimAgeMs: 120_000,
} as const;
