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
 * `escape` dispatches two (`clearSelection` + `exitTakeover`), and
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
 *
 * ### Exhibit keys
 *
 * A running exhibit's section kinds' shortcuts are walked first, with their section's data;
 * the first non-null `run` wins, else the global row runs. Each key is bound once: hotkeys-js
 * fires a key bound twice twice, so a kind key the global table already binds is not re-bound.
 */
import { take, call, put, select } from 'typed-redux-saga';

import { createKeyboardListener } from '../../services/input/createKeyboardListener';
import { exhibitRegistry } from '../../data/exhibits/exhibitRegistry';
import { KEYBOARD_SHORTCUTS, SHORTCUTS_BY_KEY } from './keyboardShortcuts';
import { selectTakeoverSource } from '../takeover/selectors';
import { asArray } from '../../utils/asArray';
import { shortcutKeys } from '../../utils/input/shortcutKeys';
import type { RootState } from '../../store/types';

/** The running exhibit's first kind shortcut on `key` that does something, else null. */
function exhibitRun(state: RootState, key: string) {
  const source = selectTakeoverSource(state);
  if (source?.kind !== 'exhibit') return null;
  for (const { kind, data } of exhibitRegistry[source.id].body) {
    for (const shortcut of kind.shortcuts ?? []) {
      if (!shortcutKeys(shortcut.keys).includes(key)) continue;
      const actions = shortcut.run(state, data);
      if (actions !== null) return actions;
    }
  }
  return null;
}

export function* watchKeyboardEventsSaga() {
  const kindShortcuts = [
    ...new Set(Object.values(exhibitRegistry).flatMap((e) => e.body.map((s) => s.kind))),
  ].flatMap((kind) => kind.shortcuts ?? []);
  const bound = [
    ...KEYBOARD_SHORTCUTS,
    ...kindShortcuts.filter((s) => !shortcutKeys(s.keys).some((k) => k in SHORTCUTS_BY_KEY)),
  ];
  const channel = yield* call(createKeyboardListener, bound);
  try {
    while (true) {
      const key = yield* take(channel);
      const state = yield* select((s: RootState) => s);
      const actions = exhibitRun(state, key) ?? SHORTCUTS_BY_KEY[key]?.run(state) ?? null;
      for (const action of asArray(actions)) yield* put(action);
    }
  } finally {
    channel.close();
  }
}
