/**
 * VoyageClock — the voyage transport's view of the clock: play state, the speed factor's label,
 * whether a trip profile is playing (the label then pulses), and the speed ladder's ends.
 */

export type VoyageClock = {
  readonly paused: boolean;
  readonly rateLabel: string;
  readonly profiled: boolean;
  readonly atSlowest: boolean;
  readonly atFastest: boolean;
};
