/**
 * PickFrameCam — the camera facts the Milky-Way pick helpers need from the
 * last VISUAL frame: world position + vertical field of view.
 *
 * Stashed onto `EnginePickingState.lastFrameCam` by the point-sprites pass,
 * so the pick gate derives from the ONE camera the pick pass actually
 * replays.  The alternative — reading the live
 * `state.cam` drag register — is wrong: `state.cam` is not the rendered
 * pose (the rendered camera is assembled per frame from the camera-driver
 * table), so it lags driver-driven motion like wheel zoom.  A pick gate or
 * pick-billboard size computed from the drag register disagrees with the
 * frame the pick renders against; computed from this snapshot, it cannot.
 *
 * `position` is a fresh non-aliasing tuple (the frame context snapshots the
 * assembled camera's position into a new readonly tuple each frame), so a
 * later camera move never mutates a stashed snapshot in place.
 */

import type { Vec3 } from '../../math/Vec3';

export type PickFrameCam = {
  readonly position: Readonly<Vec3>;
  readonly fovYRad: number;
};
