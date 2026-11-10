/**
 * watchGestureLearnedSaga — marks a camera gesture learned the first time any source makes it,
 * for `GestureHint`. It reads the folded `inputMoved` stream rather than the device events, so
 * a click (no held motion past `LOOK_LEARNED_TRAVEL`) never counts as a look and a wheel notch
 * or pinch counts as zoom. Each gesture dispatches once; the saga ends when both are learned.
 */
import { put, select, take } from 'typed-redux-saga';

import { inputGestureStarted, inputMoved } from '../input/inputSlice';
import { gestureLearned } from './uiSlice';
import { selectLearnedGestures } from './selectors';
import { LOOK_LEARNED_TRAVEL } from '../../data/input/lookLearnedTravel';

export function* watchGestureLearnedSaga() {
  let travel = 0;
  for (;;) {
    const learned = yield* select(selectLearnedGestures);
    if (learned.look && learned.zoom) return;
    const action = yield* take([inputGestureStarted, inputMoved]);
    if (inputGestureStarted.match(action)) {
      travel = 0;
      continue;
    }
    let zoom = false;
    for (const m of action.payload.motion) {
      if (m.intent === 'zoom' || m.intent === 'navZoom') zoom = true;
      else travel += Math.hypot(m.dx, m.dy);
    }
    if (travel >= LOOK_LEARNED_TRAVEL && !learned.look) yield* put(gestureLearned('look'));
    if (zoom && !learned.zoom) yield* put(gestureLearned('zoom'));
  }
}
