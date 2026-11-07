/**
 * remoteReceiverSaga — the dome's end of the remote link (`?remote` only, forked
 * through `runSaga`). Each remote's device events drive their own
 * `inputSourceSaga` under `remote:<id>`, commands map to actions through the
 * registry, searches rank as the palette does, and a status and the menu go out per
 * `hello`, and a status on store change, throttled. It only dispatches; nothing here
 * reaches the engine. `guideRows` must be one array for the session: it keys
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
import { actionChannel, cancel, delay, fork, put, select, take } from 'typed-redux-saga';

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
import { parseRemoteCommand } from '../../utils/remote/parseRemoteCommand';
import { runRemoteCommand } from '../../utils/remote/runRemoteCommand';
import { REMOTE_MENU } from './remoteMenu';
import { selectDomeStatus } from './selectDomeStatus';
import { selectSkyEntry } from '../sky/selectSkyEntry';
import { selectSkyHost } from '../sky/selectSkyHost';
import { selectToggleRows } from '../settings/selectToggleRows';
import { selectLayerSwitchRows } from '../settings/selectLayerSwitchRows';
import { parseRemoteMessage } from '../../utils/remote/parseRemoteMessage';
import { rankPaletteMatches } from '../../utils/palette/rankPaletteMatches';
import { remoteSearchMatches } from '../../utils/remote/remoteSearchMatches';
import { pairingUrl } from '../../utils/remote/pairingUrl';
import { REMOTE_SILENCE_MS } from '../../data/remote/remoteSilenceMs';
import { REMOTE_PROTOCOL_VERSION } from '../../data/remote/remoteProtocolVersion';
import type { DeviceEvent } from '../../@types/input/DeviceEvent';
import type { DomeMessage } from '../../@types/remote/DomeMessage';
import type { DomeMessageBody } from '../../@types/remote/DomeMessageBody';
import type { RelayRoom } from '../../@types/remote/RelayRoom';
import type { RemoteId } from '../../@types/remote/RemoteId';
import type { RemoteLinkStatus } from '../../@types/remote/RemoteLinkStatus';
import type { RemoteTransport } from '../../@types/remote/RemoteTransport';
import type { LayerToggleRow } from '../../@types/engine/layer/LayerToggleRow';
import type { RootState } from '../../store/types';

/** The dome sends at most one change-driven status per this many ms (four a second); a `hello` is answered apart. */
const STATUS_MIN_INTERVAL_MS = 250;

export function* remoteReceiverSaga(
  transport: RemoteTransport,
  guideRows: readonly LayerToggleRow[],
  switchRows: readonly LayerToggleRow[],
): SagaIterator {
  const link = transport.host();
  const rooms = eventChannel<RelayRoom>((emit) => link.onRoom(emit), buffers.expanding());
  const texts = eventChannel<string>((emit) => link.onText(emit), buffers.expanding());
  const linkStatuses = eventChannel<RemoteLinkStatus>(
    (emit) => link.onStatus(emit),
    buffers.expanding(),
  );

  const sources = new Map<RemoteId, Channel<DeviceEvent>>();
  const lastResize = new Map<RemoteId, DeviceEvent>();
  const watchdogs = new Map<RemoteId, Task>();

  const send = (body: DomeMessageBody): void => {
    const message: DomeMessage = { v: REMOTE_PROTOCOL_VERSION, ...body };
    link.send(JSON.stringify(message));
  };
  const rowsOf = (state: RootState) => ({
    toggleRows: selectToggleRows(state, guideRows),
    switchRows: selectLayerSwitchRows(state, switchRows),
  });
  const sendStatus = (state: RootState): void => {
    const rows = rowsOf(state);
    const status = selectDomeStatus(state, rows.toggleRows, rows.switchRows, performance.now());
    send({ kind: 'status', status });
  };
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

  // Cancelling the watchdogs too: a remote that rejoins inside its silence window must pair again.
  function* pairOnEveryRoom() {
    while (true) {
      const room = yield* take(rooms);
      for (const watchdog of watchdogs.values()) yield* cancel(watchdog);
      watchdogs.clear();
      [...sources.keys()].forEach(closeSource);
      const url = room.onSky ? pairingUrl(room.origin, room.code) : null;
      yield* put(remotePairingStarted({ code: room.code, pairingUrl: url }));
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
    yield* fork(pairOnEveryRoom);
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
          const rows = rowsOf(yield* select());
          for (const action of runRemoteCommand(message.command, {
            nowMs: performance.now(),
            ...rows,
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
            { hereOpen: selectSkyEntry(state) !== null, host: selectSkyHost(state) },
          );
          const matches = remoteSearchMatches(ranked);
          const { requestId } = message;
          send({ kind: 'searchResults', requestId, matches });
          break;
        }
      }
    }
  } finally {
    [...sources.keys()].forEach(closeSource);
    rooms.close();
    texts.close();
    linkStatuses.close();
    link.close();
  }
}
