import type { InputStep } from './InputStep';

/** An `InputStep` as the input layer hands it to the drain: a zoom carries the device-event times
 * of the notches folded into it (the source's clock, ms), which `replayInput` reads its freshness
 * off and strips, because the gap that makes a notch fresh is between EVENTS, never frames. */
export type RawInputStep =
  | Exclude<InputStep, { kind: 'zoom' }>
  | (Extract<InputStep, { kind: 'zoom' }> & {
      readonly firstEventMs: number;
      readonly lastEventMs: number;
    });
