/**
 * createKeyboardListener — wrap `hotkeys-js` in a redux-saga `eventChannel` so a
 * saga can `take` keystrokes as plain action-like events.
 *
 * `hotkeys-js` owns the parts that MUST stay synchronous and DOM-side: the
 * keydown listener, the combo/keyname parsing (`right`, `left`, `space`, `⌘+k`),
 * and the platform fold. The caller passes a list of `KeyboardShortcut`s (which
 * keys, plus each key's `preventDefault` flag); the channel carries only the
 * matched key string outward, and the routing (key → which action) lives in
 * the consuming saga.
 *
 * ### Why preventDefault here, not in the saga
 *
 * `event.preventDefault()` must run inside the DOM event tick. A saga consuming
 * the emitted key runs a tick later — too late to cancel the browser default
 * (Space/arrows scroll the page). So the listener applies each shortcut's
 * static `preventDefault` flag synchronously, then the channel reports which
 * key fired.
 *
 * ### Form-field guard
 *
 * `hotkeys.filter` gates whether a keydown is even considered. The form-field
 * guard is hotkeys-js's builtin filter: it already ignores `input` /
 * `textarea` / `select` (with its own exceptions for e.g.
 * `range`/`checkbox`/`button` inputs and `readOnly` fields) and
 * `contentEditable` targets, so the listener relies on it directly rather
 * than adding its own.
 *
 * The teardown returned to `eventChannel` unbinds every registered key set when
 * the channel is closed, so `hotkeys` holds no listener once the caller is done.
 *
 * ### Headless guard
 *
 * `hotkeys-js` binds a `keydown` listener on `document`, so calling it where no
 * DOM exists (Node — the test suite's default environment, or any SSR pass)
 * throws `document is not defined`. There is nothing to listen to without a
 * DOM, so the correct behaviour is a channel that simply never emits: the
 * consuming saga's `take(channel)` parks forever, exactly as it would in a
 * browser tab where the user never presses a key. The alternative — letting the
 * throw escape — would abort `watchKeyboardEventsSaga` and (via redux-saga's
 * fork tree) any siblings composed under the same `all(...)`, turning "no
 * keyboard" into "the whole root saga fell over". In a real browser `document`
 * is always present, so this branch is dead there and changes no user-facing
 * behaviour; it is purely headless hardening.
 */

import hotkeys from 'hotkeys-js';
import { eventChannel, type EventChannel } from 'redux-saga';

import type { KeyboardShortcut } from '../../@types/state/input/KeyboardShortcut';

export function createKeyboardListener(shortcuts: readonly KeyboardShortcut[]): EventChannel<string> {
  if (typeof document === 'undefined') {
    // No DOM ⇒ no keydown source. Return a channel that never emits and whose
    // teardown is a no-op, so `take(channel)` parks and `channel.close()` is safe.
    return eventChannel<string>(() => () => {});
  }
  return eventChannel<string>((emit) => {
    for (const shortcut of shortcuts) {
      hotkeys(shortcut.keys, (event, handler) => {
        if (shortcut.preventDefault) event.preventDefault();
        emit(handler.key);
      });
    }
    return () => {
      for (const shortcut of shortcuts) hotkeys.unbind(shortcut.keys);
    };
  });
}
