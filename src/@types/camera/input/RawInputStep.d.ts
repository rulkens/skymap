import type { InputStep } from './InputStep';

/** An `InputStep` as the input layer hands it to the drain: a zoom before `replayInput` decides
 * its `fresh`, carrying the device-event times of the notches folded into it (the source's
 * clock, ms), because the gap that makes a notch fresh is between EVENTS, never frames. */
export type RawInputStep =
  | Exclude<InputStep, { kind: 'zoom' }>
  | (Omit<Extract<InputStep, { kind: 'zoom' }>, 'fresh'> & {
      readonly firstEventMs: number;
      readonly lastEventMs: number;
    });
