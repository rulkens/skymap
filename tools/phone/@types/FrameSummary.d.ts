/** rAF-driven frames on the busiest renderer main thread of a trace; ms throughout. */
export type FrameSummary = {
  readonly frames: number;
  readonly spanMs: number;
  readonly intervalMedianMs: number;
  readonly intervalP95Ms: number;
  readonly callbackMedianMs: number;
  readonly callbackP95Ms: number;
};
