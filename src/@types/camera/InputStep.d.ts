/**
 * InputStep — one frame's worth of input, collapsed by `inputAggregator`.
 *
 * A `drag` run carries absolute CSS pixels rather than a delta: `startPx` is
 * where the pointer stood at the END of the previous frame (or the press
 * point), `endPx` where it stands now. Anchored gestures need the two pixels
 * to cast rays through, and the delta is recoverable from them.
 *
 * `factor` is multiplicative on distance; wheel ticks and pinch ratios fold
 * into one because both are multiplicative on the same term. `duringGesture`
 * splits the two owners: with a pointer down the drag register is what
 * renders, at rest the store `base` is.
 *
 * Not readonly: the aggregator extends the run in place as events arrive.
 */

import type { DragMode } from './DragMode';
import type { Vec2 } from '../math/Vec2';

export type InputStep =
  | { kind: 'gestureStart' }
  | { kind: 'gestureEnd' }
  | { kind: 'drag'; mode: DragMode; startPx: Vec2; endPx: Vec2 }
  | { kind: 'zoom'; factor: number; duringGesture: boolean };
