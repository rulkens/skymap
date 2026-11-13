/**
 * playSkyClipSaga — plays one of the sky takeover's camera clips with `clipStarted` (never
 * `startClip`, which would start a clip takeover and preempt this one). True once it ends,
 * false when another clip replaced it. Cancelled mid-flight, it ends its own clip, so the
 * next owner never inherits a flight that lands the sky under it.
 */
import { cancelled, put, race, select, take } from 'typed-redux-saga';

import { clipEnded, clipStarted } from '../camera/cameraIntentSlice';
import type { ClipData } from '../../@types/animation/ClipData';
import type { OrientationFrameId } from '../../@types/camera/orientation/OrientationFrameId';
import type { RootState } from '../../store/types';

export function* playSkyClipSaga(data: ClipData, frame: OrientationFrameId) {
  yield* put(clipStarted({ data, frame }));
  try {
    const { ended } = yield* race({ ended: take(clipEnded), replaced: take(clipStarted) });
    return ended !== undefined;
  } finally {
    if (yield* cancelled()) {
      const clip = yield* select((state: RootState) => state.camera.intent.clip);
      if (clip?.data === data) yield* put(clipEnded());
    }
  }
}
