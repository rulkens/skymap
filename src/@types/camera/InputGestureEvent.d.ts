/**
 * InputGestureEvent — what the orbit-controls gesture recognizer emits.
 * Positions in CSS pixels, wheel deltas unconverted; `inputAggregator` folds a
 * frame's worth into `InputStep`s and the frame's drain applies them.
 *
 * `*Anchor` arms carry no motion — they re-baseline the aggregator on a fresh
 * contact, so a gesture's first run measures from the press point rather than
 * from the previous gesture's last position.
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
