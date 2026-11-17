/**
 * ExhibitKeySection — a colour-ramp legend: `ramp` holds the gradient's CSS
 * stops in order, `ends` the labels spread beneath it.
 */

export type ExhibitKeySection = {
  heading: string;
  ramp: readonly string[];
  ends: readonly string[];
};
