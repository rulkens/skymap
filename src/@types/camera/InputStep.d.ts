/**
 * InputStep — one frame's worth of input, converted from the `input` slice's
 * pending steps by `pendingToInputSteps`.
 *
 * A `drag` run carries absolute CSS pixels, not a delta, because the body arm
 * casts a ray through each pixel: `startPx` is where the pointer stood at the
 * END of the previous frame (or the press point). `duringGesture` splits the
 * two zoom owners: pointer down ⇒ the gesture register renders, at rest ⇒ the
 * store `base` does. `cursorPx` is where the wheel fired, in the same absolute
 * pixels; `null` for a pinch, which has two contacts and no single cursor. A
 * `navDrag` is the navigator's pointer motion in CSS pixels; no rung reads it.
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
