/** Estimates how fast the sim clock runs against real time, from frame-to-frame deltas. */
export type SimRateTracker = {
  /** Records the sim time seen on a frame; a repeat of the same `nowMs` changes nothing. */
  observe(simMs: number, nowMs: number): void;
  /** Absolute sim ms per real ms; 0 before the second frame and while the clock is paused. */
  rate(): number;
};
