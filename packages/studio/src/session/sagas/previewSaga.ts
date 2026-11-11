/**
 * previewSaga — the one writer of `camera.clip` while the studio is open. Once the draft first
 * compiles it plays it paused, then after every action copies the studio's transport to the camera
 * when its identity changes and swaps in each newly compiled revision; a draft that does not
 * compile sends nothing, so the view keeps the last good one. While running it follows the t the
 * engine drew. A sky drag over a following camera frees it (free look, Q-A). Cancelling the session
 * cancels the play, whose end reverts the scene.
 */
import { call, cancel, fork, getContext, put, select, take, takeEvery } from 'typed-redux-saga';
import type { Task } from 'redux-saga';

import { freeLookStarted, playheadFollowed } from '../state/studioSlice';
import { selectPreview, selectTransport } from '../state/selectors';
import { selectPlayableData } from '../state/selectPlayableData';
import { clipDataReplaced, clipTransportSet } from '../../../../../src/state/camera/cameraSlice';
import { inputMoved } from '../../../../../src/state/input/inputSlice';
import type { SagaContext } from '../../../../../src/store/types';

export function* previewSaga(): Generator {
  const playClip = yield* getContext<SagaContext['playClip']>('playClip');
  let data = yield* select(selectPlayableData);
  while (data === null) {
    yield* take('*');
    data = yield* select(selectPlayableData);
  }
  const { frame } = (yield* select(selectPreview))!;
  let transport = yield* select(selectTransport);
  const opened = data;
  // `playClip` dispatches `clipStarted` synchronously, so the transport lands before any frame.
  yield* fork(function* () {
    yield* call(playClip, opened, frame, 'revert' as const);
  });
  yield* put(clipTransportSet(transport));
  yield* takeEvery(inputMoved, freeLookSaga);

  let follow: Task | null = null;
  while (true) {
    yield* take('*');
    const nextTransport = yield* select(selectTransport);
    if (nextTransport !== transport) {
      transport = nextTransport;
      yield* put(clipTransportSet(transport));
    }
    const nextData = yield* select(selectPlayableData);
    if (nextData !== null && nextData !== data) {
      data = nextData;
      yield* put(clipDataReplaced(data));
    }
    const running = transport.kind === 'running';
    if (running && follow === null) follow = yield* fork(followSaga);
    else if (!running && follow !== null) {
      yield* cancel(follow);
      follow = null;
    }
  }
}

// `playheadFollowed` is a studio write, which wakes nothing, so this loop cannot feed itself.
function* followSaga(): Generator {
  const nextFrame = yield* getContext<SagaContext['nextFrame']>('nextFrame');
  const cameraRuntime = yield* getContext<SagaContext['cameraRuntime']>('cameraRuntime');
  while (true) {
    yield* call(nextFrame);
    const at = cameraRuntime()?.clipAt;
    if (at) yield* put(playheadFollowed(at));
  }
}

// Synchronous inside the dispatch, so the frame that consumes the motion already sees it free.
function* freeLookSaga(action: ReturnType<typeof inputMoved>): Generator {
  const transport = yield* select(selectTransport);
  if (transport.kind === 'paused' && transport.camera === 'free') return;
  const moves = action.payload.motion.some((m) => m.dx !== 0 || m.dy !== 0 || m.ratio !== 1);
  if (moves) yield* put(freeLookStarted());
}
