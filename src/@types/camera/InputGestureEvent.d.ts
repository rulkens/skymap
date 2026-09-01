/**
 * InputGestureEvent — what the orbit-controls gesture recognizer emits.
 * Positions in CSS pixels, wheel deltas unconverted; `inputAggregator` folds a
 * frame's worth into `InputStep`s and the frame's drain applies them.
 *
 * `*Anchor` arms carry no motion — they re-baseline the aggregator on a fresh
 * contact, so a gesture's first run measures from the press point rather than
 * from the previous gesture's last position.
 *
 * The wheel carries its cursor pixel because the body arm zooms toward what
 * the cursor is over even with no pointer down (spec §6b) — there is no drag
 * baseline to read it off at rest.
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
