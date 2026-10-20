/**
 * remoteReceiverSaga — the dome's end of the remote link (`?remote` only, forked
 * through `runSaga`). Each remote's device events drive their own
 * `inputSourceSaga` under `remote:<id>`, commands map to actions through the
 * registry, searches rank as the palette does, and a status and the menu go out per
 * `hello`, and a status on store change, throttled. It only dispatches; nothing here
 * reaches the engine. `layerRows` must be one array for the session: it keys
 * `selectToggleRows`'s single-slot memo.
 */

import type { Action } from '@reduxjs/toolkit';
import {
  buffers,
  channel,
  eventChannel,
  type Channel,
  type SagaIterator,
  type Task,
} from 'redux-saga';
import { actionChannel, call, cancel, delay, fork, put, select, take } from 'typed-redux-saga';

import { remotePaired, remotePairingStarted } from './remoteSlice';
import { selectRemote } from './selectors';
import { inputSourceSaga } from '../input/inputSourceSaga';
import { setUiHidden } from '../ui/uiSlice';
import {
  selectAliasIndex,
  selectFamousGalaxiesMeta,
  selectLayerSearchRows,
  selectStructureSearchList,
} from '../engine/selectors';
import { parseRemoteCommand } from '../../compositions/parseRemoteCommand';
import { runRemoteCommand } from '../../compositions/runRemoteCommand';
import { REMOTE_MENU } from '../../compositions/remoteMenu';
import { selectDomeStatus } from '../../compositions/selectDomeStatus';
import { selectToggleRows } from '../../compositions/selectToggleRows';
import { parseRemoteMessage } from '../../utils/remote/parseRemoteMessage';
import { rankPaletteMatches } from '../../utils/palette/rankPaletteMatches';
import { remoteSearchMatches } from '../../utils/remote/remoteSearchMatches';
import { REMOTE_SILENCE_MS } from '../../data/remote/remoteSilenceMs';
import { STATUS_MIN_INTERVAL_MS } from '../../data/remote/statusMinIntervalMs';
import type { DeviceEvent } from '../../@types/input/DeviceEvent';
import type { DomeMessage } from '../../@types/remote/DomeMessage';
import type { RemoteId } from '../../@types/remote/RemoteId';
import type { RemoteLinkStatus } from '../../@types/remote/RemoteLinkStatus';
import type { RemoteTransport } from '../../@types/remote/RemoteTransport';
import type { LayerSettingsRow } from '../../@types/engine/layer/LayerSettingsRow';
import type { RootState } from '../../store/types';

export function* remoteReceiverSaga(
  transport: RemoteTransport,
  layerRows: readonly LayerSettingsRow[],
): SagaIterator {
  const code = transport.newRoom();
  const origins = yield* call(transport.pairingOrigins);
  const pairingUrl = origins.length > 0 ? `${origins[0]}/remote.html#${code}` : null;
  yield* put(remotePairingStarted({ code, pairingUrl }));
  const link = transport.open(code);
  const texts = eventChannel<string>((emit) => link.onText(emit), buffers.expanding());
  const linkStatuses = eventChannel<RemoteLinkStatus>(
    (emit) => link.onStatus(emit),
    buffers.expanding(),
  );

  const sources = new Map<RemoteId, Channel<DeviceEvent>>();
  const lastResize = new Map<RemoteId, DeviceEvent>();
  const watchdogs = new Map<RemoteId, Task>();

  const send = (message: DomeMessage): void => link.send(JSON.stringify(message));
  const sendStatus = (state: RootState): void =>
    send({
      kind: 'status',
      status: selectDomeStatus(state, selectToggleRows(state, layerRows), performance.now()),
    });
  // END reaches the pump, whose `finally` ends an open gesture and detaches.
  const closeSource = (from: RemoteId): void => {
    sources.get(from)?.close();
    sources.delete(from);
  };

  function* closeAfterSilence(from: RemoteId) {
    yield* delay(REMOTE_SILENCE_MS);
    closeSource(from);
    watchdogs.delete(from);
  }

  function* closeAllOnLinkClosed() {
    while (true) {
      if ((yield* take(linkStatuses)) === 'closed') [...sources.keys()].forEach(closeSource);
    }
  }

  // Leading and trailing: the sliding buffer keeps one change from the cool-down, so the last one still goes out.
  function* publishStatusOnChange() {
    const changes = yield* actionChannel('*', buffers.sliding<Action>(1));
    let sent: RootState | null = null;
    while (true) {
      yield* take(changes);
      const state: RootState = yield* select();
      if (state === sent) continue;
      sent = state;
      sendStatus(state);
      yield* delay(STATUS_MIN_INTERVAL_MS);
    }
  }

  try {
    yield* fork(closeAllOnLinkClosed);
    yield* fork(publishStatusOnChange);
    while (true) {
      const message = parseRemoteMessage(yield* take(texts), parseRemoteCommand);
      if (message === null) continue;
      const { from } = message;
      const known = watchdogs.has(from);
      const watchdog = watchdogs.get(from);
      if (watchdog) yield* cancel(watchdog);
      watchdogs.set(from, yield* fork(closeAfterSilence, from));

      switch (message.kind) {
        case 'hello': {
          // A live remote's 1 s heartbeat must not dismiss a re-shown code.
          if (!known && selectRemote(yield* select()).phase !== 'paired') {
            yield* put(remotePaired());
            yield* put(setUiHidden(true));
          }
          sendStatus(yield* select());
          send({ kind: 'menu', menu: REMOTE_MENU });
          break;
        }
        case 'command': {
          const toggleRows = selectToggleRows(yield* select(), layerRows);
          for (const action of runRemoteCommand(message.command, {
            nowMs: performance.now(),
            toggleRows,
          })) {
            yield* put(action);
          }
          break;
        }
        case 'device': {
          const { event } = message;
          let source = sources.get(from);
          if (!source) {
            // A plain channel, not an event channel: this loop puts into it, so
            // nothing dispatches late, and every down and up must reach the pump.
            source = channel<DeviceEvent>(buffers.expanding());
            sources.set(from, source);
            const size = lastResize.get(from);
            if (size) yield* put(source, size);
            yield* fork(inputSourceSaga, `remote:${from}`, source);
          }
          if (event.kind === 'resize') lastResize.set(from, event);
          yield* put(source, event);
          break;
        }
        case 'search': {
          const state: RootState = yield* select();
          const ranked = rankPaletteMatches(
            selectFamousGalaxiesMeta(state),
            selectAliasIndex(state),
            selectStructureSearchList(state),
            selectLayerSearchRows(state),
            message.query,
          );
          const matches = remoteSearchMatches(ranked);
          send({ kind: 'searchResults', requestId: message.requestId, matches });
          break;
        }
      }
    }
  } finally {
    [...sources.keys()].forEach(closeSource);
    texts.close();
    linkStatuses.close();
    link.close();
  }
}
