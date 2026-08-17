/**
 * watchKeyboardEventsSaga — the app's single always-on keyboard drain. It opens
 * one `createKeyboardListener` channel over the whole `KEYBOARD_SHORTCUTS` table,
 * then for each fired key looks up its `KeyboardShortcut`, resolves `run(state)`
 * against the live store, and dispatches whatever action(s) it returns. Routing
 * (which key does what) lives entirely in the shortcut data; this saga is the
 * uniform pump.
 *
 * ### Why `run`'s result goes through `asArray`
 *
 * A `run` returns `Action | Action[] | null`: most keys dispatch one action,
 * `escape` dispatches three (`clearSelection` + `exitTour` + `stopClip`), and
 * the gated keys (`f` with nothing selected, the tour keys outside a tour, `/`
 * with the palette already open) return `null`. `asArray` folds all three
 * shapes into one iterable so `null` naturally puts nothing.
 *
 * ### Why preventDefault is NOT this saga's concern
 *
 * `event.preventDefault()` must run inside the synchronous DOM event tick; a saga
 * consuming the emitted key runs a tick later, too late to cancel the browser
 * default (see `createKeyboardListener`'s "Why preventDefault here, not in the
 * saga"). The listener applies each shortcut's static `preventDefault` flag
 * itself; the channel reports only which key fired.
 */
import { take, call, put, select } from 'typed-redux-saga';

import { createKeyboardListener } from '../../services/input/createKeyboardListener';
import { KEYBOARD_SHORTCUTS, SHORTCUTS_BY_KEY } from './keyboardShortcuts';
import { asArray } from '../../utils/asArray';
import type { RootState } from '../../store/types';

export function* watchKeyboardEventsSaga() {
  const channel = yield* call(createKeyboardListener, KEYBOARD_SHORTCUTS);
  try {
    while (true) {
      const key = yield* take(channel);
      const shortcut = SHORTCUTS_BY_KEY[key];
      if (!shortcut) continue;
      const state = yield* select((s: RootState) => s);
      for (const action of asArray(shortcut.run(state))) yield* put(action);
    }
  } finally {
    channel.close();
  }
}
