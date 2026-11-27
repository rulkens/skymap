import { smoothstep } from '../math/smoothstep';
import type { TargetChange } from '../../@types/animation/TargetChange';

/** Where `change`'s smoothstep ramp, begun at `from`, stands at t; `rampAt`'s curve. */
export function valueAt(from: number, change: TargetChange, t: number): number {
  return (
    from + (change.to - from) * smoothstep(change.atSec, change.atSec + change.overMs / 1000, t)
  );
}
