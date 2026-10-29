/**
 * focusMoveClip — the `ClipData` a camera tween flies, from its style's row.
 *
 * Memoised on descriptor identity: a descriptor stays the same reference for
 * its tween's lifetime, so `evaluateClip`'s compile cache (a WeakMap on the
 * `ClipData`) reuses its tracks every frame, and steady frames allocate nothing.
 */

import type { CameraTweenDescriptor } from '../../../@types/camera/CameraTweenDescriptor';
import type { ClipData } from '../../../@types/animation/ClipData';
import { focusMotionRowOf } from './focusMotionRowOf';

const cache = new WeakMap<CameraTweenDescriptor, ClipData>();

export function focusMoveClip(d: CameraTweenDescriptor): ClipData {
  const cached = cache.get(d);
  if (cached !== undefined) return cached;
  const data = focusMotionRowOf(d.motion).clipOf(d);
  cache.set(d, data);
  return data;
}
