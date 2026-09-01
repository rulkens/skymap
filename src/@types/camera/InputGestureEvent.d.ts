/**
 * InputGestureEvent — what the orbit-controls gesture recognizer emits.
 *
 * Raw-ish: positions in CSS pixels, wheel deltas unconverted. The recognizer
 * never applies anything; `inputAggregator` folds a frame's worth of these
 * into `InputStep`s and the frame's drain applies them.
 *
 * The `*Anchor` arms carry no motion — they re-baseline the aggregator on a
 * fresh contact so the first run of a gesture measures from the press point
 * rather than from the previous gesture's last position.
 */

import type { DragMode } from './DragMode';

export type InputGestureEvent =
  | { kind: 'gestureStart' }
  | { kind: 'gestureEnd' }
  | { kind: 'dragAnchor'; xPx: number; yPx: number }
  | { kind: 'dragMove'; mode: DragMode; xPx: number; yPx: number }
  | { kind: 'pinchAnchor'; distPx: number }
  | { kind: 'pinchMove'; distPx: number }
  | { kind: 'wheel'; deltaY: number; duringGesture: boolean };
