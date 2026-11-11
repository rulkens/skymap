import { valueAt } from './valueAt';
import type { TargetChange } from '../../@types/animation/TargetChange';

/**
 * The opacity a continuous play shows at t and the ramp left. Each change starts from where the
 * previous ramp stood at its instant, as `fadeController`'s mid-flight retarget does, on the same
 * curve, so a seek lands where a play would have been. `changes` ascend by `atSec`; null before
 * the first one.
 */
export function rampAt(
  start: number,
  changes: readonly TargetChange[],
  t: number,
): { readonly value: number; readonly target: number; readonly remainingMs: number } | null {
  let from = start;
  let current: TargetChange | null = null;
  for (const change of changes) {
    if (change.atSec > t) break;
    if (current !== null) from = valueAt(from, current, change.atSec);
    current = change;
  }
  if (current === null) return null;
  return {
    value: valueAt(from, current, t),
    target: current.to,
    remainingMs: Math.max(0, current.overMs - (t - current.atSec) * 1000),
  };
}
