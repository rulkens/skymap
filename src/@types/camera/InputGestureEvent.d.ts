/**
 * InputGestureEvent — what the orbit-controls gesture recognizer emits.
 * Positions in CSS pixels, wheel deltas unconverted; `inputAggregator` folds a
 * frame's worth into `InputStep`s. `*Anchor` arms carry no motion — they
 * re-baseline the aggregator on a fresh contact, so a gesture's first run
 * measures from the press point, not the previous gesture's last position. The
 * wheel carries its own cursor pixel because the body arm zooms toward what the
 * cursor is over with no pointer down (spec §6b), where no drag baseline exists.
 */

import type { DragMode } from './DragMode';

export type InputGestureEvent =
  | { kind: 'gestureStart' }
  | { kind: 'gestureEnd' }
  | { kind: 'dragAnchor'; xPx: number; yPx: number }
  | { kind: 'dragMove'; mode: DragMode; xPx: number; yPx: number }
  | { kind: 'pinchAnchor'; distPx: number }
  | { kind: 'pinchMove'; distPx: number }
  | { kind: 'wheel'; deltaY: number; duringGesture: boolean; xPx: number; yPx: number };
