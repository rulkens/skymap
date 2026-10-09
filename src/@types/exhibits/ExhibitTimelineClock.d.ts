/** The sim clock as the exhibit timeline's transport row shows it: play state, rate label and speed limits. */
export type ExhibitTimelineClock = {
  readonly paused: boolean;
  /** The ladder detent's label, or the mission profile's current speed while one plays. */
  readonly rateLabel: string;
  /** True while a mission profile drives the clock (the label is then a live speed). */
  readonly profiled: boolean;
  /** Show the time of day under the date: the profile is slower than a day per second. */
  readonly showTime: boolean;
  readonly atSlowest: boolean;
  readonly atFastest: boolean;
};
