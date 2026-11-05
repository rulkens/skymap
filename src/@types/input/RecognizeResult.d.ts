import type { Gesture } from './Gesture';
import type { RecognizerState } from './RecognizerState';

/** One `recognize` step: the carried state and the gestures this event produced, in order. */
export type RecognizeResult = {
  readonly state: RecognizerState;
  readonly gestures: readonly Gesture[];
};
