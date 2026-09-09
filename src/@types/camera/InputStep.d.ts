/**
 * InputStep — one frame's worth of input, collapsed by `inputAggregator`.
 *
 * A `drag` run carries absolute CSS pixels, not a delta: `startPx` is where the
 * pointer stood at the END of the previous frame (or the press point). Not
 * readonly — the aggregator extends a run in place. `duringGesture` splits the
 * two zoom owners: pointer down ⇒ the gesture register renders, at rest ⇒ the
 * store `base` does. `cursorPx` is where the wheel fired, in the same absolute
 * pixels; `null` for a pinch, which has two contacts and no single cursor.
 */

import type { DragMode } from './DragMode';
import type { Vec2 } from '../math/Vec2';

export type InputStep =
  | { kind: 'gestureStart' }
  | { kind: 'gestureEnd' }
  | { kind: 'drag'; mode: DragMode; startPx: Vec2; endPx: Vec2 }
  | { kind: 'zoom'; factor: number; duringGesture: boolean; cursorPx: Vec2 | null };
