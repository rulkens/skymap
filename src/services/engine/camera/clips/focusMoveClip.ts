/**
 * focusMoveClip — the `ClipData` a camera tween flies, from its style's row,
 * with a `fov` track beside it over the same window and ease when the
 * descriptor carries a lens.
 *
 * Memoised on descriptor identity: a descriptor stays the same reference for
 * its tween's lifetime, so `evaluateClip`'s compile cache (a WeakMap on the
 * `ClipData`) reuses its tracks every frame, and steady frames allocate nothing.
 */

import type { CameraTweenDescriptor } from '../../../../@types/camera/focusMotion/CameraTweenDescriptor';
import type { ClipData } from '../../../../@types/animation/ClipData';
import { all, seq, tween } from '../../animation/effectHelpers';
import { focusMotionRowOf } from './focusMotionRowOf';

const cache = new WeakMap<CameraTweenDescriptor, ClipData>();

export function focusMoveClip(d: CameraTweenDescriptor): ClipData {
  const cached = cache.get(d);
  if (cached !== undefined) return cached;
  const row = focusMotionRowOf(d.motion);
  const move = row.clipOf(d);
  const lens = d.fovYRad;
  const data: ClipData =
    lens === undefined
      ? move
      : {
          start: { ...d.from, fov: lens.from },
          timeline: [
            all([
              seq(move.timeline),
              tween('fov', { to: lens.to, over: row.durationMsOf(d) / 1000, ease: row.easeOf(d) }),
            ]),
          ],
        };
  cache.set(d, data);
  return data;
}
