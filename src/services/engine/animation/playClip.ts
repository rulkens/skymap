/**
 * playClip — dispatch-time seam between clip authoring and the animation runtime.
 *
 * The returned Promise resolves on BOTH clip-end edges — natural completion and
 * abort via the redux-saga `[CANCEL]` hook — and never rejects.
 */

import { CANCEL } from 'redux-saga';

import { resolveClipStart, clipStarted } from '../../../state/camera/cameraSlice';
import type { ClipData } from '../../../@types/animation/ClipData';
import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { OrientationFrameId } from '../../../@types/camera/OrientationFrameId';
import type { AppDispatch } from '../../../store/types';
import type { ClipPlayer } from '../../../@types/engine/subsystems/ClipPlayer';

export type PlayClipDeps = {
  store: { dispatch: AppDispatch };

  clipPlayer: Pick<ClipPlayer, 'stop' | 'registerEndResolver'>;

  /** Live produced camera pose, in world Mpc. */
  getLivePose: () => CameraPose;
};

export function createPlayClip(
  deps: PlayClipDeps,
): (clip: ClipData, frame: OrientationFrameId) => Promise<void> {
  const { store, clipPlayer, getLivePose } = deps;

  return function playClip(clip: ClipData, frame: OrientationFrameId): Promise<void> {
    // Fresh object every call, even when `start` was already concrete: the clip
    // epoch resets on `camera.clip` reference identity.
    const resolvedClip = resolveClipStart(clip, getLivePose());

    // Resolver registered before clipStarted dispatches, so a zero-duration clip
    // completing synchronously still finds it in place.
    const p = new Promise<void>((resolve) => {
      clipPlayer.registerEndResolver(resolve);
    });

    (p as Promise<void> & { [CANCEL]: () => void })[CANCEL] = () => {
      clipPlayer.stop();
    };

    // `frame` is pinned at dispatch time so a later orientation switch re-expresses
    // the clip's pose instead of reinterpreting it (clip row in cameraDrivers.ts).
    store.dispatch(clipStarted({ data: resolvedClip, frame }));

    return p;
  };
}
