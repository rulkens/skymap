/**
 * When the satellites re-sweep (spec §5.5). The vertex stage's extrapolation, worst case over 2,000
 * LEO objects on 2026-10-28: 0.8 m at 1 s, 67 m at 30 s, 436 m at 60 s, 3.3 km at 120 s. So a sweep
 * is due a real second after the last one was drawn (if the clock moved at all), or at once when the
 * clock is `maxSimAgeMs` from it; past `maxDrawSimAgeMs` the dots are not drawn at all (a jumped
 * clock, or time running faster than sweeps land). The planner also
 * wakes an idle frame loop after `realIntervalMs`, so a camera at rest still sees them move.
 */
export const SATELLITE_SWEEP_TIMING = {
  realIntervalMs: 1_000,
  maxSimAgeMs: 30_000,
  maxDrawSimAgeMs: 60_000,
} as const;
