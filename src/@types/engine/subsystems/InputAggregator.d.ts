/**
 * InputAggregator — the queue between the DOM gesture recognizer and the
 * frame's single input-apply site.
 *
 * `push` runs in a DOM handler and only accumulates; `drain` runs once per
 * frame and hands over everything since the last frame, with consecutive
 * same-kind motion folded into one step. Folding is exact for the incumbent
 * orbit math: within a run the distance-derived rates are constant, so the
 * per-event sum and the net-delta application agree.
 */

import type { InputGestureEvent } from '../../camera/InputGestureEvent';
import type { InputStep } from '../../camera/InputStep';

export type InputAggregator = {
  push(event: InputGestureEvent): void;
  /** Steps since the last drain, in arrival order. Empties the queue. */
  drain(): readonly InputStep[];
  destroy(): void;
};
