/**
 * createKeyboardListener — wrap `hotkeys-js` in a redux-saga `eventChannel` so a
 * saga can `take` keystrokes as plain action-like events.
 *
 * `hotkeys-js` owns the parts that MUST stay synchronous and DOM-side: the
 * keydown listener, the combo/keyname parsing (`right`, `left`, `space`, `⌘+k`),
 * the platform fold, and the built-in form-field guard (it does not fire inside
 * `input` / `textarea` / `select`). The channel carries only the matched key
 * string outward; the routing (key → which action) lives in the consuming saga.
 *
 * ### Why preventDefault here, not in the saga
 *
 * `event.preventDefault()` must run inside the DOM event tick. A saga consuming
 * the emitted key runs a tick later — too late to cancel the browser default
 * (Space/arrows scroll the page). So the listener cancels the default for every
 * registered key synchronously; the channel just reports which key fired. The
 * caller decides WHICH keys to register (and, by closing the channel, WHEN they
 * are live) — e.g. the tour binds its keys only while a tour runs, so this
 * preventDefault never reaches outside that window.
 *
 * The teardown returned to `eventChannel` unbinds the same key set when the
 * channel is closed, so `hotkeys` holds no listener once the caller is done.
 */

import hotkeys from 'hotkeys-js';
import { eventChannel, type EventChannel } from 'redux-saga';

/** `keys` is a hotkeys-js key list, e.g. `'right,left,space'`. */
export function createKeyboardListener(keys: string): EventChannel<string> {
  return eventChannel<string>((emit) => {
    hotkeys(keys, (event, handler) => {
      event.preventDefault();
      emit(handler.key);
    });
    return () => {
      hotkeys.unbind(keys);
    };
  });
}
