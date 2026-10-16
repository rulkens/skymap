/**
 * createRemoteSourceChannel — one remote's device events, pushed by the
 * receiver saga and drained by that remote's `inputSourceSaga`. A plain
 * channel, not an event channel: the receiver `put`s into it from inside its
 * own loop, so no callback dispatches late. Unbounded, because every `down`
 * and `up` must reach the recognizer; `close()` drains the buffer, then ENDs.
 */
import { buffers, channel, type Channel } from 'redux-saga';

import type { DeviceEvent } from '../../@types/input/DeviceEvent';

export function createRemoteSourceChannel(): Channel<DeviceEvent> {
  return channel<DeviceEvent>(buffers.expanding());
}
