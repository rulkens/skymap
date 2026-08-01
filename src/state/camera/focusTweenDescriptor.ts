/**
 * focusTweenDescriptor — the pure `SelectionRow → CameraTweenDescriptor` table.
 *
 * A focus gesture writes the focus ref; the camera flying to that target is the
 * EFFECT of that Intent, and `watchFocusTweenSaga` is where that effect lives. This
 * function is the pure core of that saga: given the resolved row, the live
 * from-pose, and the lens FOV, it returns the `startCameraTween` payload. No
 * engine state, no dispatch, no clock — so it is trivially unit-testable and the
 * saga stays a thin resolve-then-dispatch shell.
 *
 * ### Why a table, not a branch chain in the saga
 *
 * The four focus targets — a catalog galaxy, a structure, the Milky Way, a scene
 * body — frame differently: a galaxy by its `diameterKpc`, a structure by its
 * apparent radius through the projection FOV, the Milky Way at a fixed view
 * distance on the galactic centre, a scene body by its physical radius through
 * the FOV. That is a tagged-union dispatch on `row.type`, so it is an
 * exhaustive `switch` returning one descriptor per arm — not an `if/else` ladder
 * spread through the saga body (simplicity.md §7).
 *
 * ### What is shared across arms
 *
 * Every arm preserves the user's orientation — `yaw`/`pitch` carry over from the
 * live `from` pose, only `target` and `distance` change — and every arm uses the
 * project-wide `FOCUS_TWEEN_MS` duration and the `easeOutCubic` curve. The `to`
 * target is always copied into a fresh array so the descriptor never aliases the
 * row's `worldPos` (or the shared `MILKY_WAY_CENTER_WORLD` constant).
 */

import { FOCUS_TWEEN_MS } from '../../services/engine/camera/focusTweenDuration';
import { focusFraming } from '../../services/engine/camera/focusFraming';
import type { SelectionRow } from '../../@types/engine/SelectionRow';
import type { CameraPose } from '../../@types/camera/CameraPose';
import type { CameraTweenDescriptor } from '../../@types/camera/CameraTweenDescriptor';
import type { OrientationFrameId } from '../../@types/camera/OrientationFrameId';

/**
 * Build the focus tween's `from → to` descriptor.
 *
 * `from` is the live produced pose (the camera the user actually sees), so an
 * in-flight tween hands off smoothly when the user re-focuses mid-animation.
 * `fovYRad` is the projection FOV the structure and body arms need to frame
 * their subject to screen-fill; the galaxy and Milky Way arms ignore it.
 * `frame` is the orientation live at the caller's dispatch time — stamped
 * onto the descriptor so the tween driver can re-express the pose if the
 * setting changes mid-flight (same contract as `clipStarted`'s `frame`).
 */
export function focusTweenDescriptor(
  row: SelectionRow,
  from: CameraPose,
  fovYRad: number,
  frame: OrientationFrameId,
): CameraTweenDescriptor {
  return {
    from,
    to: { yaw: from.yaw, pitch: from.pitch, ...focusFraming(row, fovYRad) },
    durationMs: FOCUS_TWEEN_MS,
    easing: 'easeOutCubic',
    frame,
  };
}
