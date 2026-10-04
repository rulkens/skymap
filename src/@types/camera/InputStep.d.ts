/**
 * InputStep — one frame's worth of input, collapsed by `inputAggregator`.
 *
 * A `drag` run carries absolute CSS pixels, not a delta, because the body arm
 * casts a ray through each pixel: `startPx` is where the pointer stood at the
 * END of the previous frame (or the press point). Not readonly — the aggregator
 * extends a run (or sums a `navDrag`'s pixel delta) in place. `duringGesture`
 * splits the two zoom owners: pointer down ⇒ the gesture register renders, at
 * rest ⇒ the store `base` does. `cursorPx` is where the wheel fired; `null` for
 * a pinch. A `navDrag` feeds the navigator only and never reaches a rung.
 */

import type { DragMode } from './DragMode';
import type { NavAxis } from './NavAxis';
import type { Vec2 } from '../math/Vec2';

export type InputStep =
  | { kind: 'gestureStart' }
  | { kind: 'gestureEnd' }
  | { kind: 'drag'; mode: DragMode; startPx: Vec2; endPx: Vec2 }
  | { kind: 'zoom'; factor: number; duringGesture: boolean; cursorPx: Vec2 | null }
  | { kind: 'navDrag'; axis: NavAxis; deltaPx: Vec2 };
