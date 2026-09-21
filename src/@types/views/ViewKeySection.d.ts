/**
 * ViewKeySection — a colour-ramp legend: `ramp` holds the gradient's CSS stops
 * in order, `ends` the labels spread beneath it, `toggle` the switch below both.
 */

import type { ViewToggle } from './ViewToggle';

export type ViewKeySection = {
  kind: 'key';
  heading: string;
  ramp: readonly string[];
  ends: readonly string[];
  toggle?: ViewToggle;
};
