/**
 * InputStep — one frame's worth of input, collapsed by `inputAggregator`.
 *
 * A `drag` run carries absolute CSS pixels, not a delta: `startPx` is where the
 * pointer stood at the END of the previous frame (or the press point). Today's
 * consumer only needs `end − start`; the encoding is chosen for spec 2's
 * anchored arm, which casts a ray through each pixel. `duringGesture` splits
 * the two zoom owners: pointer down ⇒ the drag register renders, at rest ⇒ the
 * store `base` does. Not readonly — the aggregator extends a run in place.
 * `cursorPx` is where the wheel fired, in the same absolute pixels, so an
 * at-rest zoom can anchor on what the cursor is over; `null` for a pinch,
 * which has two contacts and no single cursor.
 */

import type { DragMode } from './DragMode';
import type { Vec2 } from '../math/Vec2';

export type InputStep =
  | { kind: 'gestureStart' }
  | { kind: 'gestureEnd' }
  | { kind: 'drag'; mode: DragMode; startPx: Vec2; endPx: Vec2 }
  | { kind: 'zoom'; factor: number; duringGesture: boolean; cursorPx: Vec2 | null };
