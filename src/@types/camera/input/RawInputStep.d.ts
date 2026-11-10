import type { InputStep } from './InputStep';

/** An `InputStep` as the input layer hands it to the drain: a zoom carries the `fresh` its source
 * stamped (`inputSlice`), which `replayInput` reads and strips, so no arm sees wheel timing. */
export type RawInputStep =
  | Exclude<InputStep, { kind: 'zoom' }>
  | (Extract<InputStep, { kind: 'zoom' }> & { readonly fresh: boolean });
