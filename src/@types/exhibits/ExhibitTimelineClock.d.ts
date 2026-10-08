/** The sim clock as the exhibit timeline's transport row shows it: play state, rate label and ladder limits. */
export type ExhibitTimelineClock = {
  readonly paused: boolean;
  /** The ladder detent's label, or the ride profile's current speed while one is active. */
  readonly rateLabel: string;
  /** True while a flyby ride profile drives the clock (the label is then a live speed). */
  readonly riding: boolean;
  readonly atSlowest: boolean;
  readonly atFastest: boolean;
};
