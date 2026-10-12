/**
 * createGestureSink — the engine's single gesture entry point. `runFrame` replays
 * the aggregator queue at the top of the frame, so waking the loop is the sink's job. The two gesture-start STORE edges fire at push time,
 * not at the drain: `onDoubleClick` dispatches focus synchronously and
 * `watchFocusTweenSaga` reaches `put(startCameraTween)` with no intervening
 * yield, so a `cancelCameraTween` deferred to the next frame would kill the tween
 * double-tap-to-focus just started. `beginDrag` rides along to keep the pair atomic.
 */

import { beginDrag, cancelCameraTween } from '../../../state/camera/cameraSlice';

import type { AppDispatch } from '../../../store/types';
import type { InputAggregator } from '../../../@types/engine/subsystems/InputAggregator';
import type { GestureSink } from '../../../@types/engine/interaction/GestureSink';

export function createGestureSink(deps: {
  dispatch: AppDispatch;
  aggregator: Pick<InputAggregator, 'push'>;
  requestRender: () => void;
}): GestureSink {
  const { dispatch, aggregator, requestRender } = deps;
  return (event) => {
    if (event.kind === 'gestureStart') {
      dispatch(beginDrag());
      dispatch(cancelCameraTween());
    }
    aggregator.push(event);
    requestRender();
  };
}
