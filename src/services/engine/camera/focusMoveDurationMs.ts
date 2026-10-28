/**
 * focusMoveDurationMs — how long a camera tween runs; the tween driver retires on it.
 * Memoised on descriptor identity, like `focusMoveClip`: the end check and the
 * lookOffset fade both read it every frame, and the geodesic row derives it
 * from a whole path.
 */

import type { CameraTweenDescriptor } from '../../../@types/camera/CameraTweenDescriptor';
import { focusMotionRowOf } from './focusMotionRowOf';

const cache = new WeakMap<CameraTweenDescriptor, number>();

export function focusMoveDurationMs(d: CameraTweenDescriptor): number {
  const cached = cache.get(d);
  if (cached !== undefined) return cached;
  const durationMs = focusMotionRowOf(d).durationMsOf(d);
  cache.set(d, durationMs);
  return durationMs;
}
