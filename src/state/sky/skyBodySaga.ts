/**
 * skyBodySaga — the `sky` takeover's body (spec §5). It skips `withSceneSnapshotSaga`, as clips
 * do: time and settings changed while standing stay (R15). Focus the spot's body (the sky arm
 * releases off its subtree), then arrive and stand until the person leaves the spot (lift-off,
 * a focus fly, a link's pose, a foreign clip) or any `exitTakeover` comes; both end it as it
 * stands. Only `exitTakeover({ restore: true })` flies back to `restore`, and the run ends once
 * that flight lands.
 */
import { call, put, race, select, take } from 'typed-redux-saga';

import { exitTakeover } from '../takeover/takeoverActions';
import { updateSelectionFocus } from '../selection/selectionSlice';
import { selectOrientation } from '../settings/selectors';
import { liveCameraRuntimeSaga } from '../navigation/liveCameraRuntimeSaga';
import { arriveSaga } from './arriveSaga';
import { playSkyClipSaga } from './playSkyClipSaga';
import { returnClip } from './returnClip';
import { skyArmCtxSaga } from './skyArmCtxSaga';
import type { SkyRestore } from '../../@types/takeover/SkyRestore';
import type { SkySpot } from '../../@types/camera/pose/SkySpot';
import type { Vec3 } from '../../@types/math/Vec3';

export function* skyBodySaga(
  spot: SkySpot,
  pointLocalM: Vec3 | null,
  restore: SkyRestore,
): Generator {
  yield* put(updateSelectionFocus({ type: 'body', id: spot.body }, 'cut'));
  const { exit } = yield* race({
    exit: take(exitTakeover),
    left: call(arriveSaga, spot, pointLocalM),
  });
  if (exit?.payload?.restore !== true) return;
  yield* put(updateSelectionFocus(restore.focus, 'cut'));
  const { from } = yield* call(liveCameraRuntimeSaga);
  const back = returnClip(from, restore.base, yield* call(skyArmCtxSaga, 0));
  // A clip delivers its framing, so the restored focus owes no follow approach after it.
  yield* call(playSkyClipSaga, back, yield* select(selectOrientation));
}
