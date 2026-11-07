import type { InputStep } from './InputStep';

/** An `InputStep` as the input layer hands it to the drain: a zoom before `replayInput` decides
 * its `fresh`, because only the camera runtime keeps the wheel clock across frames. */
export type RawInputStep =
  | Exclude<InputStep, { kind: 'zoom' }>
  | Omit<Extract<InputStep, { kind: 'zoom' }>, 'fresh'>;
