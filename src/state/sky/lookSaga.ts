/**
 * lookSaga — turns a standing person's head to a lookable row: publishes whether it is below
 * the horizon (the HUD's rise offer) and starts the turn as a camera clip in the sky frame,
 * never `startClip`, which would preempt the sky takeover. Returns the clip it started.
 */
import { call, put, select } from 'typed-redux-saga';

import { clipStarted } from '../camera/cameraIntentSlice';
import { selectOrientation } from '../settings/selectors';
import { liveCameraRuntimeSaga } from '../navigation/liveCameraRuntimeSaga';
import { skyBelowHorizonSet } from './skySlice';
import { skyArmCtxSaga } from './skyArmCtxSaga';
import { skyLookFor } from './skyLookFor';
import { lookClip } from './lookClip';
import type { PlacedRow } from '../../@types/engine/selection/PlacedRow';
import type { SkySpot } from '../../@types/camera/pose/SkySpot';

export function* lookSaga(row: PlacedRow, spot: SkySpot, simDays: number) {
  const runtime = yield* call(liveCameraRuntimeSaga);
  const look = skyLookFor(row, spot, simDays, runtime.fovYRad);
  yield* put(
    skyBelowHorizonSet(
      look.kind === 'look' ? null : { riseAt: look.riseAt, neverRises: look.neverRises },
    ),
  );
  const clip = lookClip(runtime.from, runtime.fovYRad, look, spot, yield* call(skyArmCtxSaga, 0));
  yield* put(clipStarted({ data: clip, frame: yield* select(selectOrientation) }));
  return clip;
}
