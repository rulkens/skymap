/**
 * createKeyboardListener — wrap `hotkeys-js` in a redux-saga `eventChannel` so a
 * saga can `take` keystrokes as plain action-like events.
 *
 * `hotkeys-js` owns the parts that MUST stay synchronous and DOM-side: the
 * keydown listener, the combo/keyname parsing (`right`, `left`, `space`, `⌘+k`),
 * and the platform fold. The caller passes a list of `KeyboardShortcut`s (which
 * keys, plus each key's `preventDefault` policy) and a `getState` reader; the
 * channel carries only the matched key string outward, and the routing (key →
 * which action) lives in the consuming saga.
 *
 * ### Why preventDefault here, not in the saga
 *
 * `event.preventDefault()` must run inside the DOM event tick. A saga consuming
 * the emitted key runs a tick later — too late to cancel the browser default
 * (Space/arrows scroll the page). So the listener resolves each shortcut's
 * `preventDefault` synchronously and cancels the default only when it says so:
 * a static `true`/`false`, or a `(state) => boolean` predicate evaluated against
 * the live store via `getState`. The channel then reports which key fired.
 *
 * ### Form-field guard
 *
 * `hotkeys.filter` gates whether a keydown is even considered. hotkeys-js's
 * built-in filter already ignores `input` / `textarea` / `select`; it does NOT
 * cover `contentEditable`, so the filter below adds that case (previously done
 * by hand in the `useKeyboardShortcuts` hook).
 *
 * The teardown returned to `eventChannel` unbinds every registered key set when
 * the channel is closed, so `hotkeys` holds no listener once the caller is done.
 */

import hotkeys from 'hotkeys-js';
import { eventChannel, type EventChannel } from 'redux-saga';

import type { KeyboardShortcut } from '../../@types/state/input/KeyboardShortcut';
import type { RootState } from '../../store/types';

// Keep hotkeys-js's built-in input/textarea/select guard AND additionally
// ignore contentEditable targets (rich-text editors), which the default filter
// does not cover.
hotkeys.filter = (event) => {
  const target = event.target as HTMLElement | null;
  const tag = target?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
    return false;
  }
  return true;
};

export function createKeyboardListener(
  shortcuts: readonly KeyboardShortcut[],
  getState: () => RootState,
): EventChannel<string> {
  return eventChannel<string>((emit) => {
    for (const shortcut of shortcuts) {
      hotkeys(shortcut.keys, (event, handler) => {
        const { preventDefault } = shortcut;
        const swallow =
          typeof preventDefault === 'function' ? preventDefault(getState()) : preventDefault === true;
        if (swallow) event.preventDefault();
        emit(handler.key);
      });
    }
    return () => {
      for (const shortcut of shortcuts) hotkeys.unbind(shortcut.keys);
    };
  });
}
